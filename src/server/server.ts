import path from "node:path"
import { APP_NAME, SDK_CLIENT_APP, getRuntimeProfile } from "../shared/branding"
import {
  resolveDesktopCompanionServerUrl,
  type DesktopCompanionManifest,
} from "../shared/desktop-companion"
import { EventStore } from "./event-store"
import { AgentCoordinator } from "./agent"
import { discoverProjects, type DiscoveredProject } from "./discovery"
import { DesktopRenderersRegistry } from "./desktop-renderers"
import { KeybindingsManager } from "./keybindings"
import { getMachineDisplayName } from "./machine-name"
import { TerminalManager } from "./terminal-manager"
import { UpdateManager } from "./update-manager"
import type { UpdateInstallAttemptResult } from "./cli-runtime"
import { NatsBridge } from "./nats-bridge"
import { generateAuthToken } from "./nats-auth"
import { createNatsPublisher } from "./nats-publisher"
import { registerCommandResponders } from "./nats-responders"
import { ensureTerminalEventsStream, ensureChatMessageStream } from "./nats-streams"
import type { TranscriptEntry } from "../shared/types"
import { SessionOrchestrator } from "./orchestration"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"
import { createProjectAgentRouter } from "./project-agent-routes"

function getAppVersion() {
  return SDK_CLIENT_APP.split("/")[1] ?? "unknown"
}

export function createDesktopCompanionManifest(
  value: DesktopCompanionManifest,
): DesktopCompanionManifest {
  return {
    serverUrl: value.serverUrl,
    appName: value.appName,
    version: value.version,
  }
}

export interface StartKannaServerOptions {
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

export async function startKannaServer(options: StartKannaServerOptions = {}) {
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
  const keybindings = new KeybindingsManager()
  await keybindings.initialize()
  const updateManager = options.update
    ? new UpdateManager({
      currentVersion: options.update.version,
      fetchLatestVersion: options.update.fetchLatestVersion,
      installVersion: options.update.installVersion,
      devMode: getRuntimeProfile() === "dev",
    })
    : null

  const authToken = generateAuthToken()
  const natsBridge = await NatsBridge.create({ token: authToken })
  const desktopRenderers = new DesktopRenderersRegistry()
  await ensureTerminalEventsStream(natsBridge.nc)
  await ensureChatMessageStream(natsBridge.nc)

  // Use indirection to break the circular dependency:
  // agent -> onStateChange -> publisher.broadcastSnapshots
  // publisher -> agent.getActiveStatuses
  let broadcast = () => {}
  let publishMessage: (chatId: string, entry: TranscriptEntry) => void = () => {}

  const agent = new AgentCoordinator({
    store,
    onStateChange: () => broadcast(),
    onMessageAppended: (chatId, entry) => {
      publishMessage(chatId, entry)
      sessionIndex.onMessageAppended(chatId, entry, store.state)
      transcriptSearch.addEntry(chatId, entry)
      if (entry.kind === "result") {
        orchestrator.onMessageAppended(chatId, entry)
      }
    },
  })

  const orchestrator = new SessionOrchestrator({
    store,
    coordinator: agent,
  })
  agent.orchestrator = orchestrator

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

  const publisher = await createNatsPublisher({
    nc: natsBridge.nc,
    store,
    agent,
    terminals,
    keybindings,
    refreshDiscovery,
    getDiscoveredProjects: () => discoveredProjects,
    machineDisplayName,
    updateManager,
    desktopRenderers,
  })

  broadcast = () => publisher.broadcastSnapshots()
  publishMessage = (chatId, entry) => publisher.publishChatMessage(chatId, entry)

  const responders = registerCommandResponders({
    nc: natsBridge.nc,
    store,
    agent,
    terminals,
    keybindings,
    refreshDiscovery,
    updateManager,
    publisher,
    desktopRenderers,
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
            const upgraded = srv.upgrade(req, { data: { wsPort: natsBridge.natsWsPort, upstream: null } })
            if (upgraded) return undefined
            return new Response("WebSocket upgrade failed", { status: 426 })
          }

          if (url.pathname === "/desktop-companion.json") {
            return Response.json(createDesktopCompanionManifest({
              serverUrl: resolveDesktopCompanionServerUrl(hostname, actualPort),
              appName: APP_NAME,
              version: getAppVersion(),
            }))
          }

          if (url.pathname === "/health") {
            return Response.json({
              ok: true,
              port: actualPort,
              natsWsPort: natsBridge.natsWsPort,
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

  const shutdown = async () => {
    clearInterval(abandonInterval)
    for (const chatId of [...agent.activeTurns.keys()]) {
      await agent.cancel(chatId)
    }
    orchestrator.destroy()
    responders.dispose()
    publisher.dispose()
    keybindings.dispose()
    terminals.closeAll()
    await natsBridge.dispose()
    await store.compact()
    server.stop(true)
  }

  return {
    port: actualPort,
    store,
    updateManager,
    stop: shutdown,
  }
}

async function serveStatic(distDir: string, pathname: string) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname
  const filePath = path.join(distDir, requestedPath)
  const indexPath = path.join(distDir, "index.html")

  const file = Bun.file(filePath)
  if (await file.exists()) {
    return new Response(file)
  }

  const indexFile = Bun.file(indexPath)
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    })
  }

  return new Response(
    `${APP_NAME} client bundle not found. Run \`bun run build\` inside workbench/ first.`,
    { status: 503 }
  )
}
