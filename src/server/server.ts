import { homedir } from "node:os"
import path from "node:path"
import { APP_NAME, getRuntimeProfile } from "../shared/branding"
import { EventStore } from "./event-store"
import { AgentCoordinator } from "./agent"
import { discoverProjects, type DiscoveredProject } from "./discovery"
import { KeybindingsManager } from "./keybindings"
import { getMachineDisplayName } from "./machine-name"
import { TerminalManager } from "./terminal-manager"
import { UpdateManager } from "./update-manager"
import type { UpdateInstallAttemptResult } from "./cli-runtime"
import { NatsBridge } from "./nats-bridge"
import { generateAuthToken } from "./nats-auth"
import { createNatsPublisher } from "./nats-publisher"
import { writeDesktopBootstrapFile } from "./desktop-bootstrap"
import { registerCommandResponders } from "./nats-responders"
import { ensureTerminalEventsStream, ensureChatMessageStream } from "./nats-streams"
import type { TranscriptEntry } from "../shared/types"
import { ensureTinkariaBrandingPaths } from "./branding-migration"
import { DesktopRenderersRegistry } from "./desktop-renderers"
import {
  normalizeDesktopCompanionManifest,
  type DesktopCompanionManifest,
} from "../shared/desktop-companion"

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
  const brandingPaths = await ensureTinkariaBrandingPaths(homedir(), undefined, options.onMigrationProgress)
  const store = new EventStore(brandingPaths.dataDir)
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
  const keybindings = new KeybindingsManager(brandingPaths.keybindingsFilePath)
  await keybindings.initialize()
  const updateManager = options.update
    ? new UpdateManager({
      currentVersion: options.update.version,
      fetchLatestVersion: options.update.fetchLatestVersion,
      installVersion: options.update.installVersion,
      devMode: getRuntimeProfile() === "dev",
    })
    : null
  const desktopRenderers = new DesktopRenderersRegistry()

  const authToken = generateAuthToken()
  const natsBridge = await NatsBridge.create({
    token: authToken,
    bindHost: hostname,
  })
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
    onMessageAppended: (chatId, entry) => publishMessage(chatId, entry),
  })

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

  const MAX_PORT_ATTEMPTS = 20
  let actualPort = port

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      server = Bun.serve({
        port: actualPort,
        hostname,
        fetch(req) {
          const url = new URL(req.url)

          if (url.pathname === "/desktop-companion.json") {
            return Response.json(
              createDesktopCompanionManifest({
                serverUrl: `http://127.0.0.1:${actualPort}`,
                natsUrl: natsBridge.natsUrl,
                natsWsUrl: natsBridge.natsWsUrl,
                authToken,
                appName: APP_NAME,
                version: updateManager?.getSnapshot().currentVersion ?? "unknown",
              })
            )
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

          return serveStatic(distDir, url.pathname)
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

  await writeDesktopBootstrapFile(homedir(), {
    serverUrl: `http://${hostname}:${actualPort}`,
    natsUrl: natsBridge.natsUrl,
    natsWsUrl: natsBridge.natsWsUrl,
    authToken,
  })

  const shutdown = async () => {
    for (const chatId of [...agent.activeTurns.keys()]) {
      await agent.cancel(chatId)
    }
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

export function createDesktopCompanionManifest(
  value: Partial<DesktopCompanionManifest> | null | undefined
): DesktopCompanionManifest {
  return normalizeDesktopCompanionManifest(value)
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
