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
import { deriveCoordinationSnapshot, deriveAgentConfigSnapshot } from "./read-models"
import type { WorkspaceDirectoryPolicy } from "./workspace-directory-policy"
import type { RepoManager } from "./repo-manager"
import type { GitClonePolicy } from "./git-clone-policy"

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
  directoryPolicy: WorkspaceDirectoryPolicy | null
  repoManager: RepoManager | null
  clonePolicy: GitClonePolicy | null
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
  "workspace.coordination.snapshot",
  "workspace.agent.list",
  "workspace.agent.get",
  "workspace.repo.status",
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
  "workspace.todo.add",
  "workspace.todo.claim",
  "workspace.todo.complete",
  "workspace.todo.abandon",
  "workspace.claim.create",
  "workspace.claim.release",
  "workspace.worktree.create",
  "workspace.worktree.assign",
  "workspace.worktree.remove",
  "workspace.rule.set",
  "workspace.rule.remove",
  "workspace.coordination.snapshot",
  "workspace.agent.save",
  "workspace.agent.list",
  "workspace.agent.get",
  "workspace.agent.remove",
  "workspace.repo.add",
  "workspace.repo.clone",
  "workspace.repo.remove",
  "workspace.repo.label",
  "workspace.repo.status",
  "workspace.repo.pull",
  "workspace.repo.push",
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
        if (args.directoryPolicy) {
          args.directoryPolicy.onWorkspaceOpened(project.id).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} workspace dir init error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { workspaceId: project.id }
      }

      case "project.create": {
        await ensureProjectDirectory(command.localPath)
        const project = await store.openProject(command.localPath, command.title)
        await refreshDiscovery()
        if (args.directoryPolicy) {
          args.directoryPolicy.onWorkspaceOpened(project.id).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} workspace dir init error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { workspaceId: project.id }
      }

      case "project.remove": {
        const project = store.getProject(command.workspaceId)
        for (const chat of store.listChatsByProject(command.workspaceId)) {
          await agent.disposeChat(chat.id)
        }
        if (project) {
          terminals.closeByCwd(project.localPath)
        }
        await store.removeProject(command.workspaceId)
        return undefined
      }

      case "system.openExternal": {
        await openExternal(command)
        return undefined
      }

      case "system.readLocalFilePreview":
        return readLocalFilePreview(command.localPath)

      case "chat.create": {
        const chat = await store.createChat(command.workspaceId, command.repoId)
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
        const project = store.getProject(chat.workspaceId)
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
        const mergeProject = store.getProject(firstChat.workspaceId)
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
        const project = store.getProject(command.workspaceId)
        if (!project) {
          throw new Error("Project not found")
        }
        return terminals.createTerminal({
          workspacePath: project.localPath,
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
        const project = store.getProject(chat.workspaceId)
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
        const project = store.getProject(chat.workspaceId)
        if (!project) {
          return { repoStatus: null }
        }
        return {
          repoStatus: await readRepoStatus(project.localPath),
        }
      }

      case "snapshot.subscribe": {
        publisher.addSubscription(command.subscriptionId, command.topic)
        if (command.topic.type === "local-workspaces") {
          await refreshDiscovery()
        }
        return await publisher.getSnapshot(command.topic)
      }

      case "snapshot.unsubscribe": {
        publisher.removeSubscription(command.subscriptionId)
        return undefined
      }

      case "sessions.refresh": {
        const project = store.getProject(command.workspaceId)
        if (project) {
          publisher.refreshSessions(command.workspaceId, project.localPath)
        }
        return undefined
      }

      case "sessions.resume": {
        const chat = await store.createChat(command.workspaceId)
        await store.setSessionToken(chat.id, command.sessionId)
        await store.setChatProvider(chat.id, command.provider)

        // Import CLI transcript in background (don't block response)
        const project = store.getProject(command.workspaceId)
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

      case "workspace.todo.add": {
        await store.addTodo(command.workspaceId, command.todoId, command.description, command.priority ?? "normal", command.createdBy ?? "user")
        return { ok: true }
      }
      case "workspace.todo.claim": {
        await store.claimTodo(command.workspaceId, command.todoId, command.sessionId)
        return { ok: true }
      }
      case "workspace.todo.complete": {
        await store.completeTodo(command.workspaceId, command.todoId, command.outputs)
        return { ok: true }
      }
      case "workspace.todo.abandon": {
        await store.abandonTodo(command.workspaceId, command.todoId)
        return { ok: true }
      }
      case "workspace.claim.create": {
        await store.createClaim(command.workspaceId, command.claimId, command.intent, command.files, command.sessionId)
        return { ok: true }
      }
      case "workspace.claim.release": {
        await store.releaseClaim(command.workspaceId, command.claimId)
        return { ok: true }
      }
      case "workspace.worktree.create": {
        await store.createWorktree(command.workspaceId, command.worktreeId, command.branch, command.baseBranch ?? "main", "")
        return { ok: true }
      }
      case "workspace.worktree.assign": {
        await store.assignWorktree(command.workspaceId, command.worktreeId, command.sessionId)
        return { ok: true }
      }
      case "workspace.worktree.remove": {
        await store.removeWorktree(command.workspaceId, command.worktreeId)
        return { ok: true }
      }
      case "workspace.rule.set": {
        await store.setRule(command.workspaceId, command.ruleId, command.content, command.setBy)
        return { ok: true }
      }
      case "workspace.rule.remove": {
        await store.removeRule(command.workspaceId, command.ruleId)
        return { ok: true }
      }

      case "workspace.coordination.snapshot": {
        return deriveCoordinationSnapshot(store.state, command.workspaceId)
      }

      case "workspace.agent.save": {
        await store.saveAgentConfig(command.workspaceId, command.config.id, command.config)
        if (args.directoryPolicy) {
          args.directoryPolicy.onAgentConfigSaved(command.workspaceId, command.config.id, command.config).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} agent config save policy error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { ok: true }
      }
      case "workspace.agent.list": {
        return deriveAgentConfigSnapshot(store.state, command.workspaceId)
      }
      case "workspace.agent.get": {
        return store.state.agentConfigsByWorkspace.get(command.workspaceId)?.get(command.agentId) ?? null
      }
      case "workspace.agent.remove": {
        await store.removeAgentConfig(command.workspaceId, command.agentId)
        if (args.directoryPolicy) {
          args.directoryPolicy.onAgentConfigRemoved(command.workspaceId, command.agentId).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} agent config remove policy error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { ok: true }
      }

      case "workspace.repo.add": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const info = await args.repoManager.addLocal(command.localPath)
        const repoId = crypto.randomUUID()
        await store.addRepo(repoId, command.workspaceId, command.localPath, info.origin, command.label ?? null, info.branch)
        return { id: repoId, origin: info.origin, branch: info.branch }
      }

      case "workspace.repo.clone": {
        const repoId = crypto.randomUUID()
        await store.startRepoClone(repoId, command.workspaceId, command.origin, command.targetPath, command.label ?? null)
        if (args.clonePolicy) {
          args.clonePolicy.onRepoCloneStarted(repoId, command.origin, command.targetPath).catch((err: unknown) => {
            console.warn(`${LOG_PREFIX} clone policy error:`, err instanceof Error ? err.message : String(err))
          })
        }
        return { id: repoId }
      }

      case "workspace.repo.remove": {
        await store.removeRepo(command.repoId, command.workspaceId)
        return { ok: true }
      }

      case "workspace.repo.label": {
        await store.updateRepoLabel(command.repoId, command.label)
        return { ok: true }
      }

      case "workspace.repo.status": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const repo = store.state.reposById.get(command.repoId)
        if (!repo) throw new Error("Repo not found")
        const statusResult = await args.repoManager.status(repo.localPath)
        return statusResult
      }

      case "workspace.repo.pull": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const repo = store.state.reposById.get(command.repoId)
        if (!repo) throw new Error("Repo not found")
        const output = await args.repoManager.pull(repo.localPath, command.branch)
        return { output }
      }

      case "workspace.repo.push": {
        if (!args.repoManager) throw new Error("RepoManager not available")
        const repo = store.state.reposById.get(command.repoId)
        if (!repo) throw new Error("Repo not found")
        const output = await args.repoManager.push(repo.localPath, command.branch)
        return { output }
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
