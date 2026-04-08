import path from "node:path"
import { APP_NAME, getRuntimeProfile, LOG_PREFIX } from "../shared/branding"
import { EventStore } from "./event-store"
import { AgentCoordinator } from "./agent"
import { discoverProjects, type DiscoveredProject } from "./discovery"
import { getMachineDisplayName } from "./machine-name"
import { TerminalManager } from "./terminal-manager"
import { UpdateManager } from "./update-manager"
import type { UpdateInstallAttemptResult } from "./cli-runtime"
import { NatsDaemonManager, type NatsDaemonReadiness } from "./nats-daemon-manager"
import { NatsConnector } from "./nats-connector"
import { generateAuthToken } from "./nats-auth"
import { createNatsPublisher } from "./nats-publisher"
import { registerCommandResponders } from "./nats-responders"
import { ensureTerminalEventsStream, ensureChatMessageStream, ensureKitTurnEventsStream, ensureRunnerEventsStream } from "./nats-streams"
import { RunnerManager, type RunnerReadiness } from "./runner-manager"
import { RunnerProxy } from "./runner-proxy"
import { TranscriptConsumer } from "./transcript-consumer"
import type { AgentProvider, TranscriptEntry, TinkariaStatus } from "../shared/types"
import type { ClientCommand } from "../shared/protocol"
import { SessionOrchestrator } from "./orchestration"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"
import { createProjectAgentRouter } from "./project-agent-routes"
import { LocalCodexKitDaemon, ProjectKitRegistry, RemoteCodexRuntime } from "./local-codex-kit"
import { SkillCache } from "./skill-discovery"

export interface StartTinkariaServerOptions {
  port?: number
  host?: string
  strictPort?: boolean
  onMigrationProgress?: (message: string) => void
  update?: {
    version: string
    fetchLatestVersion: (packageName: string) => Promise<string>
    installVersion: (packageName: string, version: string) => UpdateInstallAttemptResult
  }
}

export interface TinkariaHealthcheck {
  ok: boolean
  status: "ok" | "degraded" | "fail"
  port: number
  natsWsPort: number
  splitMode: boolean
  natsDaemon: NatsDaemonReadiness | null
  natsConnection: ReturnType<NatsConnector["getReadiness"]>
  runner: RunnerReadiness | null
  codexKit: ReturnType<ProjectKitRegistry["getReadiness"]>
}

/** Duck-typed coordinator — satisfied by both AgentCoordinator (in-process) and RunnerProxy (split mode). */
interface SessionCoordinator {
  send(command: Extract<ClientCommand, { type: "chat.send" }>): Promise<{ chatId: string }>
  cancel(chatId: string): Promise<void>
  respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void>
  disposeChat(chatId: string): Promise<void>
  getActiveStatuses(): Map<string, TinkariaStatus>
  activeTurns: { has(key: string): boolean }
  startTurnForChat(args: {
    chatId: string; provider: AgentProvider; content: string
    delegatedContext?: string; isSpawned?: boolean; model: string; effort?: string
    serviceTier?: "fast"; planMode: boolean; appendUserPrompt: boolean
  }): Promise<void>
}

export async function startTinkariaServer(options: StartTinkariaServerOptions = {}) {
  const port = options.port ?? 3210
  const hostname = options.host ?? "127.0.0.1"
  const strictPort = options.strictPort ?? false
  const store = new EventStore()
  const machineDisplayName = getMachineDisplayName()
  await store.initialize()
  await store.migrateLegacyTranscripts(options.onMigrationProgress)
  let discoveredProjects: DiscoveredProject[] = []

  async function refreshDiscovery() {
    discoveredProjects = discoverProjects()
    return discoveredProjects
  }

  await refreshDiscovery()

  let server: ReturnType<typeof Bun.serve>
  const terminals = new TerminalManager()
  const updateManager = options.update
    ? new UpdateManager({
      currentVersion: options.update.version,
      fetchLatestVersion: options.update.fetchLatestVersion,
      installVersion: options.update.installVersion,
      devMode: getRuntimeProfile() === "dev",
    })
    : null

  const authToken = generateAuthToken()
  const daemonManager = new NatsDaemonManager()
  const daemonInfo = await daemonManager.ensureDaemon({ token: authToken, host: hostname })
  const natsConnector = await NatsConnector.connect({
    natsUrl: daemonInfo.url,
    natsWsUrl: daemonInfo.wsUrl,
    natsWsPort: daemonInfo.wsPort,
    token: authToken,
  })
  await Promise.all([
    ensureTerminalEventsStream(natsConnector.nc),
    ensureChatMessageStream(natsConnector.nc),
    ensureKitTurnEventsStream(natsConnector.nc),
  ])

  const splitMode = process.env.TINKARIA_SPLIT === "true"
  const getHealthcheck = (): TinkariaHealthcheck => {
    const natsDaemon = daemonManager.getReadiness()
    const natsConnection = natsConnector.getReadiness()
    const codexKit = projectKitRegistry.getReadiness()
    const runner = splitMode ? runnerManager?.getReadiness() ?? {
      ok: false,
      runnerId: null,
      pid: null,
      registered: false,
      heartbeatFresh: false,
      lastHeartbeatAt: null,
    } : null
    const hardFailure = !natsDaemon?.ok || !natsConnection.ok || (splitMode && !runner?.ok)
    const degraded = !hardFailure && !codexKit.ok
    return {
      ok: !hardFailure,
      status: hardFailure ? "fail" : degraded ? "degraded" : "ok",
      port: actualPort,
      natsWsPort: natsConnector.natsWsPort,
      splitMode,
      natsDaemon,
      natsConnection,
      runner,
      codexKit,
    }
  }

  // Project agent: cross-session awareness and coordination
  const sessionIndex = new SessionIndex()
  const taskLedger = new TaskLedger()
  const transcriptSearch = new TranscriptSearchIndex()
  const projectAgent = new ProjectAgent({
    sessions: sessionIndex,
    tasks: taskLedger,
    search: transcriptSearch,
  })
  const projectAgentRouter = createProjectAgentRouter(projectAgent)

  // Periodic task abandonment detection (every 60s)
  const abandonInterval = setInterval(() => {
    taskLedger.detectAbandoned()
  }, 60_000)

  // Use indirection to break the circular dependency:
  // coordinator -> onStateChange -> publisher.broadcastSnapshots
  // publisher -> coordinator.getActiveStatuses
  let broadcast = () => {}
  let publishMessage: (chatId: string, entry: TranscriptEntry) => void = () => {}

  const onMessageAppended = (chatId: string, entry: TranscriptEntry) => {
    publishMessage(chatId, entry)
    sessionIndex.onMessageAppended(chatId, entry, store.state)
    transcriptSearch.addEntry(chatId, entry)
    if (entry.kind === "result") {
      orchestrator.onMessageAppended(chatId, entry)
    }
  }

  // Coordinator: RunnerProxy (split mode) or AgentCoordinator (in-process)
  let coordinator: SessionCoordinator

  let runnerManager: RunnerManager | null = null
  let transcriptConsumer: TranscriptConsumer | null = null

  const skillCache = new SkillCache()
  const projectKitRegistry = new ProjectKitRegistry(natsConnector.nc)

  if (splitMode) {
    // ── Split mode: separate runner process ──
    await ensureRunnerEventsStream(natsConnector.nc)

    runnerManager = new RunnerManager({
      nc: natsConnector.nc,
      natsUrl: daemonInfo.url,
      authToken,
    })
    const runnerId = await runnerManager.ensureRunner()

    transcriptConsumer = new TranscriptConsumer({
      nc: natsConnector.nc,
      store,
      onStateChange: () => broadcast(),
      onMessageAppended,
    })
    await transcriptConsumer.start()

    const proxy = new RunnerProxy({
      nc: natsConnector.nc,
      store,
      runnerId,
      getActiveStatuses: () => transcriptConsumer!.getActiveStatuses(),
    })
    coordinator = proxy

    console.warn(LOG_PREFIX, "Split mode enabled — runner process handles turn execution")
  } else {
    // ── In-process mode: AgentCoordinator (default) ──
    const codexRuntime = new RemoteCodexRuntime({
      nc: natsConnector.nc,
      registry: projectKitRegistry,
    })

    const agent = new AgentCoordinator({
      store,
      onStateChange: () => broadcast(),
      codexRuntime,
      skillCache,
      onMessageAppended,
    })
    coordinator = agent
  }

  const orchestrator = new SessionOrchestrator({
    store,
    coordinator,
  })

  // Wire orchestrator into coordinator (breaks circular init dependency)
  if (!splitMode && "orchestrator" in coordinator) {
    (coordinator as AgentCoordinator).orchestrator = orchestrator
  }

  const publisher = await createNatsPublisher({
    nc: natsConnector.nc,
    store,
    agent: coordinator,
    terminals,
    refreshDiscovery,
    getDiscoveredProjects: () => discoveredProjects,
    machineDisplayName,
    updateManager,
    skillCache,
    orchestrator,
  })

  broadcast = () => publisher.broadcastSnapshots()
  publishMessage = (chatId, entry) => publisher.publishChatMessage(chatId, entry)

  const responders = registerCommandResponders({
    nc: natsConnector.nc,
    store,
    agent: coordinator,
    terminals,
    refreshDiscovery,
    updateManager,
    publisher,
    onStateChange: () => publisher.broadcastSnapshots(),
  })

  const distDir = path.join(import.meta.dir, "..", "..", "dist", "client")

  type NatsWsData = { wsPort: number; upstream: WebSocket | null }

  const MAX_PORT_ATTEMPTS = 20
  let actualPort = port

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      server = Bun.serve<NatsWsData>({
        port: actualPort,
        hostname,
        fetch(req, srv) {
          const url = new URL(req.url)

          if (url.pathname === "/nats-ws") {
            const upgraded = srv.upgrade(req, { data: { wsPort: natsConnector.natsWsPort, upstream: null } })
            if (upgraded) return undefined
            return new Response("WebSocket upgrade failed", { status: 426 })
          }

          if (url.pathname === "/health") {
            const healthcheck = getHealthcheck()
            return Response.json(healthcheck, {
              status: healthcheck.ok ? 200 : 503,
            })
          }

          if (url.pathname === "/auth/token") {
            return Response.json({ token: authToken })
          }

          if (url.pathname.startsWith("/api/project/")) {
            return projectAgentRouter(req)
          }

          return serveStatic(distDir, url.pathname)
        },
        websocket: {
          open(ws) {
            const upstream = new WebSocket(`ws://127.0.0.1:${ws.data.wsPort}`)
            upstream.binaryType = "arraybuffer"
            upstream.onmessage = (event) => {
              if (ws.readyState === WebSocket.OPEN) {
                if (typeof event.data === "string") {
                  ws.sendText(event.data)
                } else {
                  ws.sendBinary(new Uint8Array(event.data as ArrayBuffer))
                }
              }
            }
            upstream.onclose = () => { if (ws.readyState === WebSocket.OPEN) ws.close() }
            upstream.onerror = () => { if (ws.readyState === WebSocket.OPEN) ws.close() }
            ws.data.upstream = upstream
          },
          message(ws, message) {
            ws.data.upstream?.send(message)
          },
          close(ws) {
            ws.data.upstream?.close()
            ws.data.upstream = null
          },
        },
      })
      break
    } catch (err: unknown) {
      const isAddrInUse =
        err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EADDRINUSE"
      if (!isAddrInUse || strictPort || attempt === MAX_PORT_ATTEMPTS - 1) {
        throw err
      }
      console.log(`Port ${actualPort} is in use, trying ${actualPort + 1}...`)
      actualPort++
    }
  }

  // Start Codex kit daemon in background — not on the critical path for HTTP
  let localCodexKit: LocalCodexKitDaemon | null = null
  void LocalCodexKitDaemon.start({
    nc: natsConnector.nc,
    natsUrl: natsConnector.natsUrl,
    authToken,
  }).then((daemon) => {
    localCodexKit = daemon
    projectKitRegistry.setError(null)
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    projectKitRegistry.setError(message)
    console.warn(LOG_PREFIX, `Codex kit daemon failed to start: ${message}`)
  })

  console.warn(LOG_PREFIX, `Operational health initialized — status: ${getHealthcheck().status}, splitMode: ${splitMode}`)

  const shutdown = async () => {
    clearInterval(abandonInterval)
    // Cancel active turns (in-process mode only — split mode turns live in runner)
    if (!splitMode) {
      for (const [chatId] of coordinator.getActiveStatuses()) {
        await coordinator.cancel(chatId)
      }
    }
    orchestrator.destroy()
    responders.dispose()
    publisher.dispose()
    terminals.closeAll()
    projectKitRegistry.dispose()
    transcriptConsumer?.stop()
    await localCodexKit?.dispose()
    await runnerManager?.dispose()
    await natsConnector.dispose()
    await daemonManager.dispose()
    await store.compact()
    server.stop(true)
  }

  return {
    port: actualPort,
    store,
    updateManager,
    healthcheck: getHealthcheck,
    stop: shutdown,
  }
}

async function serveStatic(distDir: string, pathname: string) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname
  const filePath = path.join(distDir, requestedPath)
  const indexPath = path.join(distDir, "index.html")

  const file = Bun.file(filePath)
  if (await file.exists()) {
    const isHashedAsset = requestedPath.startsWith("/assets/")
    const isHtml = requestedPath.endsWith(".html")
    const cacheControl = isHashedAsset
      ? "public, max-age=31536000, immutable"
      : isHtml
        ? "no-cache"
        : undefined

    const headers: Record<string, string> = {}
    if (cacheControl) headers["Cache-Control"] = cacheControl

    return new Response(file, { headers })
  }

  const indexFile = Bun.file(indexPath)
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  }

  return new Response(
    `${APP_NAME} client bundle not found. Run \`bun run build\` inside workbench/ first.`,
    { status: 503 }
  )
}
