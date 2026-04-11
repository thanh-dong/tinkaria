import path from "node:path"
import { APP_NAME, getRuntimeProfile, LOG_PREFIX } from "../shared/branding"
import { EventStore } from "./event-store"
import { discoverProjects, type DiscoveredProject } from "./discovery"
import { getMachineDisplayName } from "./machine-name"
import { TerminalManager } from "./terminal-manager"
import { UpdateManager } from "./update-manager"
import type { UpdateInstallAttemptResult } from "./cli-runtime"
import { NatsDaemonManager, type NatsDaemonReadiness } from "./nats-daemon-manager"
import { NatsConnector } from "./nats-connector"
import { generateAuthToken } from "./nats-auth"
import { readToken } from "../nats/nats-token"
import { createNatsPublisher } from "./nats-publisher"
import { registerCommandResponders } from "./nats-responders"
import { ensureTerminalEventsStream, ensureChatMessageStream, ensureRunnerEventsStream, ensureWorkspaceCoordinationStream } from "./nats-streams"
import { RunnerManager, type RunnerReadiness } from "./runner-manager"
import { RunnerProxy } from "./runner-proxy"
import { TranscriptConsumer } from "./transcript-consumer"
import type { AgentProvider, TranscriptEntry, SessionStatus } from "../shared/types"
import type { ClientCommand } from "../shared/protocol"
import { SessionOrchestrator } from "./orchestration"
import { SessionIndex } from "./session-index"
import { TranscriptSearchIndex } from "./transcript-search"
import { WorkspaceAgent } from "./workspace-agent"
import { createWorkspaceAgentRouter } from "./workspace-agent-routes"
import { SkillCache } from "./skill-discovery"

export interface StartServerOptions {
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

export const NATS_WS_PROXY_BUFFER_LIMIT = 256

export type NatsWsProxyCounters = {
  upgrades: number
  upstreamOpen: number
  upstreamError: number
  upstreamClose: number
  sendOnConnecting: number
  bufferedFrames: number
  bufferDrops: number
}

// Strings or owned ArrayBuffers — never Bun's recv Buffer slices, which get
// reused out from under us.
type NatsWsBufferedFrame = string | ArrayBuffer

export type NatsWsProxyData = {
  wsPort: number
  upstream: WebSocket | null
  ready: boolean
  closed: boolean
  buffer: NatsWsBufferedFrame[]
  droppedSinceLastLog: number
  openedAt: number
}

type IncomingWsMessage = string | Buffer<ArrayBuffer>

function toBufferedFrame(message: IncomingWsMessage): NatsWsBufferedFrame {
  if (typeof message === "string") return message
  const copy = new ArrayBuffer(message.byteLength)
  new Uint8Array(copy).set(message)
  return copy
}

export function createNatsWsProxyHandlers(
  counters: NatsWsProxyCounters = {
    upgrades: 0,
    upstreamOpen: 0,
    upstreamError: 0,
    upstreamClose: 0,
    sendOnConnecting: 0,
    bufferedFrames: 0,
    bufferDrops: 0,
  },
) {
  const handlers = {
    open(ws: import("bun").ServerWebSocket<NatsWsProxyData>) {
      counters.upgrades += 1
      ws.data.openedAt = Date.now()
      ws.data.ready = false
      ws.data.closed = false
      ws.data.buffer = []
      ws.data.droppedSinceLastLog = 0
      console.warn(LOG_PREFIX, "nats-ws proxy upgrade accepted")

      const upstream = new WebSocket(`ws://127.0.0.1:${ws.data.wsPort}`)
      upstream.binaryType = "arraybuffer"
      ws.data.upstream = upstream

      upstream.onopen = () => {
        if (ws.data.closed) {
          upstream.close()
          return
        }
        const elapsed = Date.now() - ws.data.openedAt
        ws.data.ready = true
        counters.upstreamOpen += 1
        console.warn(LOG_PREFIX, `nats-ws proxy upstream open t=${elapsed}ms`)

        const pending = ws.data.buffer
        ws.data.buffer = []
        for (const frame of pending) {
          upstream.send(frame)
        }
      }

      upstream.onmessage = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (typeof event.data === "string") {
          ws.sendText(event.data)
        } else {
          ws.sendBinary(new Uint8Array(event.data as ArrayBuffer))
        }
      }

      upstream.onclose = (event) => {
        counters.upstreamClose += 1
        const duration = Date.now() - ws.data.openedAt
        console.warn(
          LOG_PREFIX,
          `nats-ws proxy upstream close code=${event.code} duration=${duration}ms`,
        )
        if (ws.readyState === WebSocket.OPEN) ws.close()
      }

      upstream.onerror = () => {
        counters.upstreamError += 1
        console.warn(LOG_PREFIX, "nats-ws proxy upstream error")
        if (ws.readyState === WebSocket.OPEN) ws.close()
      }
    },
    message(ws: import("bun").ServerWebSocket<NatsWsProxyData>, message: IncomingWsMessage) {
      const upstream = ws.data.upstream
      if (ws.data.ready && upstream && upstream.readyState === WebSocket.OPEN) {
        upstream.send(message)
        ws.data.droppedSinceLastLog = 0
        return
      }

      counters.sendOnConnecting += 1
      counters.bufferedFrames += 1
      ws.data.buffer.push(toBufferedFrame(message))

      if (ws.data.buffer.length > NATS_WS_PROXY_BUFFER_LIMIT) {
        ws.data.buffer.shift()
        counters.bufferDrops += 1
        ws.data.droppedSinceLastLog += 1
        if (ws.data.droppedSinceLastLog === 1) {
          console.warn(
            LOG_PREFIX,
            `nats-ws proxy buffer overflow — dropping oldest frame (limit=${NATS_WS_PROXY_BUFFER_LIMIT})`,
          )
        }
      }
    },
    close(ws: import("bun").ServerWebSocket<NatsWsProxyData>) {
      ws.data.closed = true
      const duration = Date.now() - ws.data.openedAt
      console.warn(LOG_PREFIX, `nats-ws proxy client close duration=${duration}ms`)
      ws.data.buffer = []
      ws.data.upstream?.close()
      ws.data.upstream = null
      ws.data.ready = false
    },
  }
  return { handlers, counters }
}

export interface ServerHealthcheck {
  ok: boolean
  status: "ok" | "degraded" | "fail"
  port: number
  natsWsPort: number
  natsDaemon: NatsDaemonReadiness | null
  natsConnection: ReturnType<NatsConnector["getReadiness"]>
  runner: RunnerReadiness
}

/** Session coordinator interface — satisfied by RunnerProxy which delegates turn execution to the runner process. */
interface SessionCoordinator {
  send(command: Extract<ClientCommand, { type: "chat.send" }>): Promise<{ chatId: string }>
  cancel(chatId: string): Promise<void>
  respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void>
  disposeChat(chatId: string): Promise<void>
  getActiveStatuses(): Map<string, SessionStatus>
  activeTurns: { has(key: string): boolean }
  startTurnForChat(args: {
    chatId: string; provider: AgentProvider; content: string
    delegatedContext?: string; isSpawned?: boolean; model: string; effort?: string
    serviceTier?: "fast"; planMode: boolean; appendUserPrompt: boolean
  }): Promise<void>
}

export async function startServer(options: StartServerOptions = {}) {
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

  const natsMode = process.env.NATS_MODE ?? "embedded"
  const runnerMode = process.env.RUNNER_MODE ?? "spawn"

  let authToken: string
  let daemonManager: NatsDaemonManager
  let daemonInfo: { url: string; wsUrl: string; wsPort: number }

  if (natsMode === "external") {
    const natsUrl = process.env.NATS_URL
    const natsWsPort = Number(process.env.NATS_WS_PORT)
    const natsDataDir = process.env.NATS_DATA_DIR
    if (!natsUrl || !natsWsPort || !natsDataDir) {
      throw new Error("NATS_MODE=external requires NATS_URL, NATS_WS_PORT, and NATS_DATA_DIR")
    }
    authToken = await readToken(natsDataDir)
    daemonManager = NatsDaemonManager.fromExternal({ natsUrl, wsPort: natsWsPort })
    const url = new URL(natsUrl)
    daemonInfo = { url: natsUrl, wsUrl: `ws://${url.hostname}:${natsWsPort}`, wsPort: natsWsPort }
    console.warn(LOG_PREFIX, `NATS_MODE=external — connecting to ${natsUrl}`)
  } else {
    authToken = generateAuthToken()
    daemonManager = NatsDaemonManager.embedded()
    const info = await daemonManager.ensureDaemon({ token: authToken, host: hostname })
    daemonInfo = info
  }

  const natsConnector = await NatsConnector.connect({
    natsUrl: daemonInfo.url,
    natsWsUrl: daemonInfo.wsUrl,
    natsWsPort: daemonInfo.wsPort,
    token: authToken,
  })
  await Promise.all([
    ensureTerminalEventsStream(natsConnector.nc),
    ensureChatMessageStream(natsConnector.nc),
    ensureRunnerEventsStream(natsConnector.nc),
    ensureWorkspaceCoordinationStream(natsConnector.nc),
  ])

  const getHealthcheck = (): ServerHealthcheck => {
    const natsDaemon = daemonManager.getReadiness()
    const natsConnection = natsConnector.getReadiness()
    const runner = runnerManager.getReadiness()
    const hardFailure = !natsDaemon?.ok || !natsConnection.ok || !runner.ok
    return {
      ok: !hardFailure,
      status: hardFailure ? "fail" : "ok",
      port: actualPort,
      natsWsPort: natsConnector.natsWsPort,
      natsDaemon,
      natsConnection,
      runner,
    }
  }

  // Project agent: cross-session awareness and coordination
  const sessionIndex = new SessionIndex()
  const transcriptSearch = new TranscriptSearchIndex()
  const projectAgent = new WorkspaceAgent({
    sessions: sessionIndex,
    store,
    search: transcriptSearch,
    workspaceId: "",
  })
  const projectAgentRouter = createWorkspaceAgentRouter(projectAgent)

  // Use indirection to break the circular dependency:
  // coordinator -> onStateChange -> publisher.broadcastSnapshots
  // publisher -> coordinator.getActiveStatuses
  //
  // Debounce: during streaming, dozens of events arrive per second.
  // Each calls onStateChange() which would trigger broadcastSnapshots().
  // Coalesce into one broadcast per microtask tick using queueMicrotask.
  // Selective invalidation: only recompute topic types that changed.
  let broadcastPending = false
  const pendingTypes = new Set<string>()
  let broadcastFn: (changedTypes?: ReadonlySet<string>) => void = () => {}
  const broadcast = (changedTypes?: ReadonlySet<string>) => {
    if (changedTypes) {
      for (const t of changedTypes) pendingTypes.add(t)
    }
    if (broadcastPending) return
    broadcastPending = true
    queueMicrotask(() => {
      broadcastPending = false
      const types = pendingTypes.size > 0 ? new Set(pendingTypes) : undefined
      pendingTypes.clear()
      broadcastFn(types)
    })
  }
  let publishMessage: (chatId: string, entry: TranscriptEntry) => void = () => {}

  const onMessageAppended = (chatId: string, entry: TranscriptEntry) => {
    publishMessage(chatId, entry)
    sessionIndex.onMessageAppended(chatId, entry, store.state)
    transcriptSearch.addEntry(chatId, entry)
    orchestrator.onMessageAppended(chatId, entry)
  }

  const skillCache = new SkillCache()

  // ── Runner process handles all turn execution ──
  const runnerManager = new RunnerManager({
    nc: natsConnector.nc,
    natsUrl: daemonInfo.url,
    authToken,
    mode: runnerMode as "spawn" | "discover",
  })
  const runnerId = await runnerManager.ensureRunner()

  const chatSidebarTypes = new Set(["chat", "sidebar", "orchestration"])
  const transcriptConsumer = new TranscriptConsumer({
    nc: natsConnector.nc,
    store,
    onStateChange: () => broadcast(chatSidebarTypes),
    onMessageAppended,
  })
  await transcriptConsumer.start()

  const coordinator: SessionCoordinator = new RunnerProxy({
    nc: natsConnector.nc,
    store,
    runnerId,
    getActiveStatuses: () => transcriptConsumer.getActiveStatuses(),
  })

  console.warn(LOG_PREFIX, "Runner process handles turn execution")

  const orchestrator = new SessionOrchestrator({
    store,
    coordinator,
  })

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

  broadcastFn = (types) => publisher.broadcastSnapshots(types)
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

  const { handlers: natsWsHandlers, counters: natsWsCounters } = createNatsWsProxyHandlers()
  const natsWsCounterInterval = setInterval(() => {
    const hasActivity = Object.values(natsWsCounters).some((v) => v > 0)
    if (!hasActivity) return
    console.warn(LOG_PREFIX, "nats-ws proxy counters:", JSON.stringify(natsWsCounters))
    for (const key of Object.keys(natsWsCounters) as (keyof NatsWsProxyCounters)[]) {
      natsWsCounters[key] = 0
    }
  }, 60_000)

  const MAX_PORT_ATTEMPTS = 20
  let actualPort = port

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      server = Bun.serve<NatsWsProxyData>({
        port: actualPort,
        hostname,
        fetch(req, srv) {
          const url = new URL(req.url)

          if (url.pathname === "/nats-ws") {
            const upgraded = srv.upgrade(req, {
              data: {
                wsPort: natsConnector.natsWsPort,
                upstream: null,
                ready: false,
                closed: false,
                buffer: [],
                droppedSinceLastLog: 0,
                openedAt: 0,
              },
            })
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
            const advertisedHost = process.env.NATS_ADVERTISED_HOST
            const natsWsUrl = advertisedHost
              ? `ws://${advertisedHost}:${natsConnector.natsWsPort}`
              : undefined
            return Response.json({
              token: authToken,
              ...(natsWsUrl ? { natsWsUrl } : {}),
            })
          }

          if (url.pathname.startsWith("/api/workspace/")) {
            return projectAgentRouter(req)
          }

          return serveStatic(distDir, url.pathname)
        },
        websocket: natsWsHandlers,
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

  console.warn(LOG_PREFIX, `Operational health initialized — status: ${getHealthcheck().status}`)

  const shutdown = async () => {
    clearInterval(natsWsCounterInterval)
    orchestrator.destroy()
    responders.dispose()
    publisher.dispose()
    terminals.closeAll()
    transcriptConsumer.stop()
    await runnerManager.dispose()
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
