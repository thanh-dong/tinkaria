import type { NatsConnection, Msg, Subscription } from "@nats-io/transport-node"
import { stat } from "node:fs/promises"
import type { ClientCommand } from "../shared/protocol"
import type { DiscoveredProject } from "./discovery"
import type { EventStore } from "./event-store"
import { openExternal } from "./external-open"
import { ensureProjectDirectory, resolveLocalPath } from "./paths"
import type { TerminalManager } from "./terminal-manager"
import type { UpdateManager } from "./update-manager"
import type { NatsPublisher } from "./nats-publisher"
import { commandSubject } from "../shared/nats-subjects"
import { LOG_PREFIX } from "../shared/branding"
import { compressPayload } from "../shared/compression"
import { findSessionFile, importCliTranscript } from "./session-discovery"
import { inspectSessionRuntime } from "./session-discovery"
import { readRepoStatus } from "./repo-status"
import { generateForkPromptForChat } from "./generate-fork-context"
import { generateMergePromptForChats as defaultGenerateMergePrompt } from "./generate-merge-context"
import type { TranscriptEntry } from "../shared/types"

/** Session coordinator interface — RunnerProxy delegates turn execution to the runner process */
interface Coordinator {
  send(command: Extract<ClientCommand, { type: "chat.send" }>): Promise<{ chatId: string }>
  cancel(chatId: string): Promise<void>
  respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void>
  disposeChat(chatId: string): Promise<void>
}

const encoder = new TextEncoder()
const MAX_LOCAL_FILE_PREVIEW_BYTES = 256 * 1024

function encode(data: unknown): Uint8Array {
  return compressPayload(encoder.encode(JSON.stringify(data)))
}

export interface RegisterRespondersArgs {
  nc: NatsConnection
  store: EventStore
  agent: Coordinator
  terminals: TerminalManager
  refreshDiscovery: () => Promise<DiscoveredProject[]>
  /** @deprecated Unused by responders -- kept for interface compatibility with tests */
  getDiscoveredProjects?: () => DiscoveredProject[]
  /** @deprecated Unused by responders -- kept for interface compatibility with tests */
  machineDisplayName?: string
  updateManager: UpdateManager | null
  publisher: NatsPublisher
  onStateChange: () => void
  generateForkPrompt?: (forkIntent: string, entries: TranscriptEntry[], cwd: string, preset?: string) => Promise<string>
  generateMergePrompt?: (mergeIntent: string, sessions: { chatId: string; entries: TranscriptEntry[] }[], cwd: string, preset?: string) => Promise<string>
}

/** Command types that do NOT mutate state and should NOT trigger onStateChange */
const NON_MUTATING: ReadonlySet<ClientCommand["type"]> = new Set([
  "system.ping",
  "terminal.input",
  "terminal.resize",
  "terminal.create",
  "update.check",
  "update.install",
  "system.readLocalFilePreview",
  "chat.getMessages",
  "chat.generateForkPrompt",
  "chat.generateMergePrompt",
  "chat.getSessionRuntime",
  "chat.getRepoStatus",
  "snapshot.subscribe",
  "snapshot.unsubscribe",
  "sessions.refresh",
])

/** Commands handled by the Bun backend. */
const SERVER_COMMANDS: readonly ClientCommand["type"][] = [
  "project.open",
  "project.create",
  "project.remove",
  "system.ping",
  "update.check",
  "update.install",
  "system.openExternal",
  "system.readLocalFilePreview",
  "chat.create",
  "chat.rename",
  "chat.delete",
  "chat.markRead",
  "chat.send",
  "chat.cancel",
  "chat.respondTool",
  "chat.generateForkPrompt",
  "chat.generateMergePrompt",
  "chat.getSessionRuntime",
  "chat.getRepoStatus",
  "terminal.create",
  "terminal.input",
  "terminal.resize",
  "terminal.close",
  "chat.getMessages",
  "snapshot.subscribe",
  "snapshot.unsubscribe",
  "sessions.resume",
  "sessions.refresh",
]

export function registerCommandResponders(args: RegisterRespondersArgs): { dispose: () => void } {
  const {
    nc,
    store,
    agent,
    terminals,
    refreshDiscovery,
    updateManager,
    publisher,
    onStateChange,
    generateForkPrompt = generateForkPromptForChat,
    generateMergePrompt = defaultGenerateMergePrompt,
  } = args

  const subs: Subscription[] = SERVER_COMMANDS.map((type) => nc.subscribe(commandSubject(type)))

  async function handleMessage(msg: Msg): Promise<void> {
    let command: ClientCommand
    try {
      command = msg.json<ClientCommand>()
    } catch {
      msg.respond(encode({ ok: false, error: "Invalid JSON payload" }))
      return
    }

    if (!command || typeof command !== "object" || typeof command.type !== "string") {
      msg.respond(encode({ ok: false, error: "Missing command type" }))
      return
    }

    try {
      const result = await executeCommand(command)
      msg.respond(encode({ ok: true, result }))

      if (!NON_MUTATING.has(command.type)) {
        onStateChange()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      msg.respond(encode({ ok: false, error: message }))
    }
  }

  async function executeCommand(command: ClientCommand): Promise<unknown> {
    switch (command.type) {
      case "system.ping":
        return undefined

      case "update.check": {
        if (!updateManager) {
          return {
            currentVersion: "unknown",
            latestVersion: null,
            status: "error",
            updateAvailable: false,
            lastCheckedAt: Date.now(),
            error: "Update manager unavailable.",
            installAction: "restart",
          }
        }
        return updateManager.checkForUpdates({ force: command.force })
      }

      case "update.install": {
        if (!updateManager) {
          throw new Error("Update manager unavailable.")
        }
        return updateManager.installUpdate()
      }

      case "project.open": {
        await ensureProjectDirectory(command.localPath)
        const project = await store.openProject(command.localPath)
        await refreshDiscovery()
        return { projectId: project.id }
      }

      case "project.create": {
        await ensureProjectDirectory(command.localPath)
        const project = await store.openProject(command.localPath, command.title)
        await refreshDiscovery()
        return { projectId: project.id }
      }

      case "project.remove": {
        const project = store.getProject(command.projectId)
        for (const chat of store.listChatsByProject(command.projectId)) {
          await agent.disposeChat(chat.id)
        }
        if (project) {
          terminals.closeByCwd(project.localPath)
        }
        await store.removeProject(command.projectId)
        return undefined
      }

      case "system.openExternal": {
        await openExternal(command)
        return undefined
      }

      case "system.readLocalFilePreview":
        return readLocalFilePreview(command.localPath)

      case "chat.create": {
        const chat = await store.createChat(command.projectId)
        return { chatId: chat.id }
      }

      case "chat.rename": {
        await store.renameChat(command.chatId, command.title)
        return undefined
      }

      case "chat.delete": {
        await agent.disposeChat(command.chatId)
        await store.deleteChat(command.chatId)
        return undefined
      }

      case "chat.markRead": {
        await store.setChatReadState(command.chatId, false)
        return undefined
      }

      case "chat.send":
        return agent.send(command)

      case "chat.cancel": {
        await agent.cancel(command.chatId)
        return undefined
      }

      case "chat.respondTool": {
        await agent.respondTool(command)
        return undefined
      }

      case "chat.generateForkPrompt": {
        const chat = store.getChat(command.chatId)
        if (!chat) {
          throw new Error("Chat not found")
        }
        const project = store.getProject(chat.projectId)
        if (!project) {
          throw new Error("Project not found")
        }
        return {
          prompt: await generateForkPrompt(command.intent, await store.getMessages(command.chatId), project.localPath, command.preset),
        }
      }

      case "chat.generateMergePrompt": {
        if (!command.chatIds || command.chatIds.length < 1) {
          throw new Error("At least 1 session is required for merge")
        }
        const firstChat = store.getChat(command.chatIds[0]!)
        if (!firstChat) {
          throw new Error(`Chat not found: ${command.chatIds[0]}`)
        }
        const mergeProject = store.getProject(firstChat.projectId)
        if (!mergeProject) {
          throw new Error("Project not found")
        }
        const sessions = await Promise.all(command.chatIds.map(async (chatId) => {
          const chat = store.getChat(chatId)
          if (!chat) {
            throw new Error(`Chat not found: ${chatId}`)
          }
          return { chatId, entries: await store.getMessages(chatId) }
        }))
        return {
          prompt: await generateMergePrompt(command.intent, sessions, mergeProject.localPath, command.preset),
        }
      }

      case "terminal.create": {
        const project = store.getProject(command.projectId)
        if (!project) {
          throw new Error("Project not found")
        }
        return terminals.createTerminal({
          projectPath: project.localPath,
          terminalId: command.terminalId,
          cols: command.cols,
          rows: command.rows,
          scrollback: command.scrollback,
        })
      }

      case "terminal.input": {
        terminals.write(command.terminalId, command.data)
        return undefined
      }

      case "terminal.resize": {
        terminals.resize(command.terminalId, command.cols, command.rows)
        return undefined
      }

      case "terminal.close": {
        terminals.close(command.terminalId)
        return undefined
      }

      case "chat.getMessages": {
        return await store.getMessages(command.chatId, {
          offset: command.offset,
          limit: command.limit,
        })
      }

      case "chat.getSessionRuntime": {
        const chat = store.getChat(command.chatId)
        if (!chat?.sessionToken || !chat.provider) {
          return { runtime: null }
        }
        const project = store.getProject(chat.projectId)
        if (!project) {
          return { runtime: null }
        }
        return {
          runtime: await inspectSessionRuntime(chat.sessionToken, chat.provider, project.localPath),
        }
      }

      case "chat.getRepoStatus": {
        const chat = store.getChat(command.chatId)
        if (!chat) {
          return { repoStatus: null }
        }
        const project = store.getProject(chat.projectId)
        if (!project) {
          return { repoStatus: null }
        }
        return {
          repoStatus: await readRepoStatus(project.localPath),
        }
      }

      case "snapshot.subscribe": {
        publisher.addSubscription(command.subscriptionId, command.topic)
        if (command.topic.type === "local-projects") {
          await refreshDiscovery()
        }
        return await publisher.getSnapshot(command.topic)
      }

      case "snapshot.unsubscribe": {
        publisher.removeSubscription(command.subscriptionId)
        return undefined
      }

      case "sessions.refresh": {
        const project = store.getProject(command.projectId)
        if (project) {
          publisher.refreshSessions(command.projectId, project.localPath)
        }
        return undefined
      }

      case "sessions.resume": {
        const chat = await store.createChat(command.projectId)
        await store.setSessionToken(chat.id, command.sessionId)
        await store.setChatProvider(chat.id, command.provider)

        // Import CLI transcript in background (don't block response)
        const project = store.getProject(command.projectId)
        if (project) {
          findSessionFile(command.sessionId, command.provider, project.localPath)
            .then((filePath) => {
              if (filePath) {
                return importCliTranscript(filePath, store, chat.id, 50)
              }
            })
            .catch((err) =>
              console.warn(LOG_PREFIX, "transcript import failed:", err instanceof Error ? err.message : String(err))
            )
        }

        return { chatId: chat.id }
      }

      default: {
        throw new Error("Unknown command type")
      }
    }
  }

  // Process messages in the background
  void (async () => {
    await Promise.all(subs.map(async (sub) => {
      for await (const msg of sub) {
        try {
          await handleMessage(msg)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(LOG_PREFIX, `Unhandled error in command responder: ${message}`)
        }
      }
    }))
  })()

  return {
    dispose() {
      for (const sub of subs) {
        sub.unsubscribe()
      }
    },
  }
}

async function readLocalFilePreview(localPath: string) {
  const resolvedPath = resolveLocalPath(localPath)
  const info = await stat(resolvedPath).catch(() => null)

  if (!info) {
    throw new Error(`Path not found: ${resolvedPath}`)
  }
  if (!info.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath}`)
  }
  if (info.size > MAX_LOCAL_FILE_PREVIEW_BYTES) {
    throw new Error(`File too large to preview: ${resolvedPath}`)
  }

  try {
    return {
      localPath: resolvedPath,
      content: await Bun.file(resolvedPath).text(),
    }
  } catch {
    throw new Error(`Failed to read file: ${resolvedPath}`)
  }
}
