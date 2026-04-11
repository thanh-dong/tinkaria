import { appendFile, mkdir, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { getDataDir, LOG_PREFIX } from "../shared/branding"
import type { AgentProvider, TranscriptEntry } from "../shared/types"
import { STORE_VERSION } from "../shared/types"
import {
  type ChatEvent,
  type CoordinationEvent,
  type MessageEvent,
  type WorkspaceEvent,
  type SnapshotFile,
  type StoreEvent,
  type StoreState,
  type TurnEvent,
  cloneTranscriptEntries,
  createEmptyCoordinationState,
  createEmptyState,
} from "./events"
import { resolveLocalPath } from "./paths"

const COMPACTION_THRESHOLD_BYTES = 2 * 1024 * 1024

interface LegacyTranscriptStats {
  hasLegacyData: boolean
  sources: Array<"snapshot" | "messages_log">
  chatCount: number
  entryCount: number
}

export class EventStore {
  readonly dataDir: string
  readonly state: StoreState = createEmptyState()
  private writeChain = Promise.resolve()
  private storageReset = false
  private readonly snapshotPath: string
  private readonly projectsLogPath: string
  private readonly chatsLogPath: string
  private readonly messagesLogPath: string
  private readonly turnsLogPath: string
  private readonly transcriptsDir: string
  private legacyMessagesByChatId = new Map<string, TranscriptEntry[]>()
  private snapshotHasLegacyMessages = false
  private transcriptCache = new Map<string, TranscriptEntry[]>()
  private static readonly TRANSCRIPT_CACHE_MAX = 5
  private readonly coordinationLogPath: string

  constructor(dataDir = getDataDir(homedir())) {
    this.dataDir = dataDir
    this.snapshotPath = path.join(this.dataDir, "snapshot.json")
    this.projectsLogPath = path.join(this.dataDir, "projects.jsonl")
    this.chatsLogPath = path.join(this.dataDir, "chats.jsonl")
    this.messagesLogPath = path.join(this.dataDir, "messages.jsonl")
    this.turnsLogPath = path.join(this.dataDir, "turns.jsonl")
    this.transcriptsDir = path.join(this.dataDir, "transcripts")
    this.coordinationLogPath = path.join(this.dataDir, "coordination.jsonl")
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true })
    await mkdir(this.transcriptsDir, { recursive: true })
    await this.ensureFile(this.projectsLogPath)
    await this.ensureFile(this.chatsLogPath)
    await this.ensureFile(this.messagesLogPath)
    await this.ensureFile(this.turnsLogPath)
    await this.ensureFile(this.coordinationLogPath)
    await this.loadSnapshot()
    await this.replayLogs()
    if (!(await this.hasLegacyTranscriptData()) && await this.shouldCompact()) {
      await this.compact()
    }
  }

  private async ensureFile(filePath: string) {
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      await Bun.write(filePath, "")
    }
  }

  private async clearStorage() {
    if (this.storageReset) return
    this.storageReset = true
    this.resetState()
    this.clearLegacyTranscriptState()
    await Promise.all([
      Bun.write(this.snapshotPath, ""),
      Bun.write(this.projectsLogPath, ""),
      Bun.write(this.chatsLogPath, ""),
      Bun.write(this.messagesLogPath, ""),
      Bun.write(this.turnsLogPath, ""),
      Bun.write(this.coordinationLogPath, ""),
    ])
  }

  private async loadSnapshot() {
    const file = Bun.file(this.snapshotPath)
    if (!(await file.exists())) return

    try {
      const text = await file.text()
      if (!text.trim()) return
      const parsed = JSON.parse(text) as SnapshotFile
      if (parsed.v !== STORE_VERSION) {
        console.warn(`${LOG_PREFIX} Resetting local chat history for store version ${STORE_VERSION}`)
        await this.clearStorage()
        return
      }
      for (const project of parsed.workspaces) {
        this.state.workspacesById.set(project.id, { ...project })
        this.state.workspaceIdsByPath.set(project.localPath, project.id)
      }
      for (const chat of parsed.chats) {
        this.state.chatsById.set(chat.id, { ...chat, unread: chat.unread ?? false, model: chat.model ?? null })
      }
      if (parsed.coordination?.length) {
        for (const entry of parsed.coordination) {
          const coord = createEmptyCoordinationState()
          for (const todo of entry.todos) coord.todos.set(todo.id, todo)
          for (const claim of entry.claims) coord.claims.set(claim.id, claim)
          for (const wt of entry.worktrees) coord.worktrees.set(wt.id, wt)
          for (const rule of entry.rules) coord.rules.set(rule.id, rule)
          this.state.coordinationByWorkspace.set(entry.workspaceId, coord)
        }
      }
      if (parsed.messages?.length) {
        this.snapshotHasLegacyMessages = true
        for (const messageSet of parsed.messages) {
          this.legacyMessagesByChatId.set(messageSet.chatId, cloneTranscriptEntries(messageSet.entries))
        }
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to load snapshot, resetting local history:`, error)
      await this.clearStorage()
    }
  }

  private resetState() {
    this.state.workspacesById.clear()
    this.state.workspaceIdsByPath.clear()
    this.state.chatsById.clear()
    this.state.coordinationByWorkspace.clear()
    this.transcriptCache.clear()
  }

  private clearLegacyTranscriptState() {
    this.legacyMessagesByChatId.clear()
    this.snapshotHasLegacyMessages = false
  }

  private async replayLogs() {
    if (this.storageReset) return
    await this.replayLog<WorkspaceEvent>(this.projectsLogPath)
    if (this.storageReset) return
    await this.replayLog<ChatEvent>(this.chatsLogPath)
    if (this.storageReset) return
    await this.replayLog<MessageEvent>(this.messagesLogPath)
    if (this.storageReset) return
    await this.replayLog<TurnEvent>(this.turnsLogPath)
    if (this.storageReset) return
    await this.replayLog<CoordinationEvent>(this.coordinationLogPath)
  }

  private async replayLog<TEvent extends StoreEvent>(filePath: string) {
    const file = Bun.file(filePath)
    if (!(await file.exists())) return
    const text = await file.text()
    if (!text.trim()) return

    const lines = text.split("\n")
    let lastNonEmpty = -1
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].trim()) {
        lastNonEmpty = index
        break
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (!line) continue
      try {
        const event = JSON.parse(line) as Partial<StoreEvent>
        if (event.v !== STORE_VERSION) {
          console.warn(`${LOG_PREFIX} Resetting local history from incompatible event log`)
          await this.clearStorage()
          return
        }
        this.applyEvent(event as StoreEvent)
      } catch (error) {
        if (index === lastNonEmpty) {
          console.warn(`${LOG_PREFIX} Ignoring corrupt trailing line in ${path.basename(filePath)}`)
          return
        }
        console.warn(`${LOG_PREFIX} Failed to replay ${path.basename(filePath)}, resetting local history:`, error)
        await this.clearStorage()
        return
      }
    }
  }

  private applyEvent(event: StoreEvent) {
    switch (event.type) {
      case "workspace_opened": {
        const localPath = resolveLocalPath(event.localPath)
        const project = {
          id: event.workspaceId,
          localPath,
          title: event.title,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        }
        this.state.workspacesById.set(project.id, project)
        this.state.workspaceIdsByPath.set(localPath, project.id)
        break
      }
      case "workspace_removed": {
        const project = this.state.workspacesById.get(event.workspaceId)
        if (!project) break
        project.deletedAt = event.timestamp
        project.updatedAt = event.timestamp
        this.state.workspaceIdsByPath.delete(project.localPath)
        break
      }
      case "chat_created": {
        const chat = {
          id: event.chatId,
          workspaceId: event.workspaceId,
          repoId: null,
          title: event.title,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          unread: false,
          provider: null,
          model: null,
          planMode: false,
          sessionToken: null,
          lastTurnOutcome: null,
        }
        this.state.chatsById.set(chat.id, chat)
        break
      }
      case "chat_renamed": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.title = event.title
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_deleted": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.deletedAt = event.timestamp
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_provider_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.provider = event.provider
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_model_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.model = event.model
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_plan_mode_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.planMode = event.planMode
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_read_state_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.unread = event.unread
        chat.updatedAt = event.timestamp
        break
      }
      case "message_appended": {
        this.applyMessageMetadata(event.chatId, event.entry)
        const existing = this.legacyMessagesByChatId.get(event.chatId) ?? []
        existing.push({ ...event.entry })
        this.legacyMessagesByChatId.set(event.chatId, existing)
        break
      }
      case "turn_started": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        break
      }
      case "turn_finished": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "success"
        chat.unread = true
        break
      }
      case "turn_failed": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "failed"
        chat.unread = true
        break
      }
      case "turn_cancelled": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "cancelled"
        break
      }
      case "session_token_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.sessionToken = event.sessionToken
        chat.updatedAt = event.timestamp
        break
      }
      case "todo_added": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.todos.set(event.todoId, {
          id: event.todoId,
          description: event.description,
          priority: event.priority,
          status: "open",
          claimedBy: null,
          outputs: [],
          createdBy: event.createdBy,
          createdAt: new Date(event.timestamp).toISOString(),
          updatedAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "todo_claimed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const todo = coord.todos.get(event.todoId)
        if (!todo) break
        todo.status = "claimed"
        todo.claimedBy = event.claimedBy
        todo.updatedAt = new Date(event.timestamp).toISOString()
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "todo_completed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const todo = coord.todos.get(event.todoId)
        if (!todo) break
        todo.status = "complete"
        todo.outputs = event.outputs
        todo.updatedAt = new Date(event.timestamp).toISOString()
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "todo_abandoned": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const todo = coord.todos.get(event.todoId)
        if (!todo) break
        todo.status = "abandoned"
        todo.updatedAt = new Date(event.timestamp).toISOString()
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "claim_created": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.claims.set(event.claimId, {
          id: event.claimId,
          intent: event.intent,
          files: event.files,
          sessionId: event.sessionId,
          status: "active",
          conflictsWith: null,
          createdAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "claim_released": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const claim = coord.claims.get(event.claimId)
        if (!claim) break
        claim.status = "released"
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "claim_conflict_detected": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const claim = coord.claims.get(event.claimId)
        if (!claim) break
        claim.status = "conflict"
        claim.conflictsWith = event.conflictsWith
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "worktree_created": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.worktrees.set(event.worktreeId, {
          id: event.worktreeId,
          branch: event.branch,
          baseBranch: event.baseBranch,
          path: event.path,
          assignedTo: null,
          status: "ready",
          createdAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "worktree_assigned": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const wt = coord.worktrees.get(event.worktreeId)
        if (!wt) break
        wt.assignedTo = event.sessionId
        wt.status = "assigned"
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "worktree_removed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        const wt = coord.worktrees.get(event.worktreeId)
        if (!wt) break
        wt.status = "removed"
        wt.assignedTo = null
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "rule_set": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.rules.set(event.ruleId, {
          id: event.ruleId,
          content: event.content,
          setBy: event.setBy,
          updatedAt: new Date(event.timestamp).toISOString(),
        })
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
      case "rule_removed": {
        const coord = this.getOrCreateCoordination(event.workspaceId)
        coord.rules.delete(event.ruleId)
        coord.lastUpdated = new Date(event.timestamp).toISOString()
        break
      }
    }
  }

  private getOrCreateCoordination(workspaceId: string) {
    let coord = this.state.coordinationByWorkspace.get(workspaceId)
    if (!coord) {
      coord = createEmptyCoordinationState()
      this.state.coordinationByWorkspace.set(workspaceId, coord)
    }
    return coord
  }

  private applyMessageMetadata(chatId: string, entry: TranscriptEntry) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat) return
    if (entry.kind === "user_prompt") {
      chat.lastMessageAt = entry.createdAt
    }
    chat.updatedAt = Math.max(chat.updatedAt, entry.createdAt)
  }

  private append<TEvent extends StoreEvent>(filePath: string, event: TEvent) {
    const payload = `${JSON.stringify(event)}\n`
    this.writeChain = this.writeChain.then(async () => {
      await appendFile(filePath, payload, "utf8")
      this.applyEvent(event)
    })
    return this.writeChain
  }

  private transcriptPath(chatId: string) {
    return path.join(this.transcriptsDir, `${chatId}.jsonl`)
  }

  private async loadTranscriptFromDisk(chatId: string): Promise<TranscriptEntry[]> {
    const transcriptPath = this.transcriptPath(chatId)
    const file = Bun.file(transcriptPath)
    if (!await file.exists()) {
      return []
    }

    const text = await file.text()
    if (!text.trim()) return []

    const entries: TranscriptEntry[] = []
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim()
      if (!line) continue
      try {
        entries.push(JSON.parse(line) as TranscriptEntry)
      } catch {
        // Skip malformed JSONL lines — one bad line must not crash transcript loading
      }
    }
    return entries
  }

  private setTranscriptCache(chatId: string, entries: TranscriptEntry[]) {
    this.transcriptCache.delete(chatId) // Remove to refresh insertion order
    this.transcriptCache.set(chatId, entries)
    if (this.transcriptCache.size > EventStore.TRANSCRIPT_CACHE_MAX) {
      const oldest = this.transcriptCache.keys().next().value
      if (oldest) this.transcriptCache.delete(oldest)
    }
  }

  async openProject(localPath: string, title?: string) {
    const normalized = resolveLocalPath(localPath)
    const existingId = this.state.workspaceIdsByPath.get(normalized)
    if (existingId) {
      const existing = this.state.workspacesById.get(existingId)
      if (existing && !existing.deletedAt) {
        return existing
      }
    }

    const workspaceId = crypto.randomUUID()
    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "workspace_opened",
      timestamp: Date.now(),
      workspaceId,
      localPath: normalized,
      title: title?.trim() || path.basename(normalized) || normalized,
    }
    await this.append(this.projectsLogPath, event)
    return this.state.workspacesById.get(workspaceId)!
  }

  async removeProject(workspaceId: string) {
    const project = this.getProject(workspaceId)
    if (!project) {
      throw new Error("Project not found")
    }

    const event: WorkspaceEvent = {
      v: STORE_VERSION,
      type: "workspace_removed",
      timestamp: Date.now(),
      workspaceId,
    }
    await this.append(this.projectsLogPath, event)
  }

  async createChat(workspaceId: string) {
    const project = this.state.workspacesById.get(workspaceId)
    if (!project || project.deletedAt) {
      throw new Error("Project not found")
    }
    const chatId = crypto.randomUUID()
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_created",
      timestamp: Date.now(),
      chatId,
      workspaceId,
      title: "New Chat",
    }
    await this.append(this.chatsLogPath, event)
    return this.state.chatsById.get(chatId)!
  }

  async renameChat(chatId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    const chat = this.requireChat(chatId)
    if (chat.title === trimmed) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_renamed",
      timestamp: Date.now(),
      chatId,
      title: trimmed,
    }
    await this.append(this.chatsLogPath, event)
  }

  async deleteChat(chatId: string) {
    this.requireChat(chatId)
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_deleted",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatProvider(chatId: string, provider: AgentProvider) {
    const chat = this.requireChat(chatId)
    if (chat.provider === provider) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_provider_set",
      timestamp: Date.now(),
      chatId,
      provider,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setPlanMode(chatId: string, planMode: boolean) {
    const chat = this.requireChat(chatId)
    if (chat.planMode === planMode) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_plan_mode_set",
      timestamp: Date.now(),
      chatId,
      planMode,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatModel(chatId: string, model: string | null) {
    const chat = this.requireChat(chatId)
    if ((chat.model ?? null) === model) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_model_set",
      timestamp: Date.now(),
      chatId,
      model,
    }
    await this.append(this.chatsLogPath, event)
  }

  async setChatReadState(chatId: string, unread: boolean) {
    const chat = this.requireChat(chatId)
    if (chat.unread === unread) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_read_state_set",
      timestamp: Date.now(),
      chatId,
      unread,
    }
    await this.append(this.chatsLogPath, event)
  }

  appendMessage(chatId: string, entry: TranscriptEntry) {
    this.requireChat(chatId)
    // In-memory first so NATS publish fires without waiting for disk I/O
    this.applyMessageMetadata(chatId, entry)
    const cached = this.transcriptCache.get(chatId)
    if (cached) {
      cached.push({ ...entry })
    }
    const payload = `${JSON.stringify(entry)}\n`
    const transcriptPath = this.transcriptPath(chatId)
    this.writeChain = this.writeChain.then(() => appendFile(transcriptPath, payload, "utf8"))
  }

  async recordTurnStarted(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_started",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordTurnFinished(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_finished",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordTurnFailed(chatId: string, error: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_failed",
      timestamp: Date.now(),
      chatId,
      error,
    }
    await this.append(this.turnsLogPath, event)
  }

  async recordTurnCancelled(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_cancelled",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(this.turnsLogPath, event)
  }

  async setSessionToken(chatId: string, sessionToken: string | null) {
    const chat = this.requireChat(chatId)
    if (chat.sessionToken === sessionToken) return
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "session_token_set",
      timestamp: Date.now(),
      chatId,
      sessionToken,
    }
    await this.append(this.turnsLogPath, event)
  }

  // --- Coordination mutation methods ---

  async addTodo(workspaceId: string, todoId: string, description: string, priority: "high" | "normal" | "low", createdBy: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_added", timestamp: Date.now(), workspaceId, todoId, description, priority, createdBy }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async claimTodo(workspaceId: string, todoId: string, claimedBy: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_claimed", timestamp: Date.now(), workspaceId, todoId, claimedBy }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async completeTodo(workspaceId: string, todoId: string, outputs: string[]) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_completed", timestamp: Date.now(), workspaceId, todoId, outputs }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async abandonTodo(workspaceId: string, todoId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "todo_abandoned", timestamp: Date.now(), workspaceId, todoId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async createClaim(workspaceId: string, claimId: string, intent: string, files: string[], sessionId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "claim_created", timestamp: Date.now(), workspaceId, claimId, intent, files, sessionId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)

    // Auto-detect file overlap with existing active claims.
    // INVARIANT: append() updates in-memory state synchronously via applyEvent(),
    // so coordinationByWorkspace is already current when we read it here.
    // Only the first overlapping claim triggers a conflict event (intentional —
    // downstream can trace the full conflict chain via claim_conflict_detected events).
    const coord = this.state.coordinationByWorkspace.get(workspaceId)
    if (coord) {
      const fileSet = new Set(files)
      for (const [existingId, existing] of coord.claims) {
        if (existingId === claimId || existing.status !== "active") continue
        const overlapping = existing.files.filter((f) => fileSet.has(f))
        if (overlapping.length > 0) {
          const conflictEvent: CoordinationEvent = {
            v: STORE_VERSION, type: "claim_conflict_detected", timestamp: Date.now(),
            workspaceId, claimId, conflictsWith: existingId, overlappingFiles: overlapping,
          }
          await this.append<CoordinationEvent>(this.coordinationLogPath, conflictEvent)
          break
        }
      }
    }
  }

  async releaseClaim(workspaceId: string, claimId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "claim_released", timestamp: Date.now(), workspaceId, claimId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async createWorktree(workspaceId: string, worktreeId: string, branch: string, baseBranch: string, wtPath: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "worktree_created", timestamp: Date.now(), workspaceId, worktreeId, branch, baseBranch, path: wtPath }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async assignWorktree(workspaceId: string, worktreeId: string, sessionId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "worktree_assigned", timestamp: Date.now(), workspaceId, worktreeId, sessionId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async removeWorktree(workspaceId: string, worktreeId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "worktree_removed", timestamp: Date.now(), workspaceId, worktreeId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async setRule(workspaceId: string, ruleId: string, content: string, setBy: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "rule_set", timestamp: Date.now(), workspaceId, ruleId, content, setBy }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  async removeRule(workspaceId: string, ruleId: string) {
    const event: CoordinationEvent = { v: STORE_VERSION, type: "rule_removed", timestamp: Date.now(), workspaceId, ruleId }
    await this.append<CoordinationEvent>(this.coordinationLogPath, event)
  }

  getProject(workspaceId: string) {
    const project = this.state.workspacesById.get(workspaceId)
    if (!project || project.deletedAt) return null
    return project
  }

  requireChat(chatId: string) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat || chat.deletedAt) {
      throw new Error("Chat not found")
    }
    return chat
  }

  getChat(chatId: string) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat || chat.deletedAt) return null
    return chat
  }

  async getMessages(chatId: string, options?: { offset?: number; limit?: number }) {
    let entries: TranscriptEntry[]

    if (this.transcriptCache.has(chatId)) {
      entries = this.transcriptCache.get(chatId)!
    } else {
      const legacyEntries = this.legacyMessagesByChatId.get(chatId)
      if (legacyEntries) {
        this.setTranscriptCache(chatId, cloneTranscriptEntries(legacyEntries))
        entries = this.transcriptCache.get(chatId)!
      } else {
        // Drain pending writes before reading from disk to ensure consistency
        await this.writeChain
        entries = await this.loadTranscriptFromDisk(chatId)
        this.setTranscriptCache(chatId, entries)
      }
    }

    if (options?.offset !== undefined || options?.limit !== undefined) {
      const start = options.offset ?? 0
      const end = options.limit !== undefined ? start + options.limit : undefined
      return cloneTranscriptEntries(entries.slice(start, end))
    }

    return cloneTranscriptEntries(entries)
  }

  async getMessageCount(chatId: string): Promise<number> {
    if (this.transcriptCache.has(chatId)) {
      return this.transcriptCache.get(chatId)!.length
    }
    const legacyEntries = this.legacyMessagesByChatId.get(chatId)
    if (legacyEntries) {
      return legacyEntries.length
    }
    await this.writeChain
    const entries = await this.loadTranscriptFromDisk(chatId)
    this.setTranscriptCache(chatId, entries)
    return entries.length
  }

  listProjects() {
    return [...this.state.workspacesById.values()].filter((project) => !project.deletedAt)
  }

  listChatsByProject(workspaceId: string) {
    return [...this.state.chatsById.values()]
      .filter((chat) => chat.workspaceId === workspaceId && !chat.deletedAt)
      .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt))
  }

  getChatCount(workspaceId: string) {
    return this.listChatsByProject(workspaceId).length
  }

  async getLegacyTranscriptStats(): Promise<LegacyTranscriptStats> {
    const messagesLogSize = await Bun.file(this.messagesLogPath).size
    const sources: LegacyTranscriptStats["sources"] = []
    if (this.snapshotHasLegacyMessages) {
      sources.push("snapshot")
    }
    if (messagesLogSize > 0) {
      sources.push("messages_log")
    }

    let entryCount = 0
    for (const entries of this.legacyMessagesByChatId.values()) {
      entryCount += entries.length
    }

    return {
      hasLegacyData: sources.length > 0 || this.legacyMessagesByChatId.size > 0,
      sources,
      chatCount: this.legacyMessagesByChatId.size,
      entryCount,
    }
  }

  async hasLegacyTranscriptData() {
    return (await this.getLegacyTranscriptStats()).hasLegacyData
  }

  private createSnapshot(): SnapshotFile {
    const coordination: SnapshotFile["coordination"] = []
    for (const [workspaceId, coord] of this.state.coordinationByWorkspace) {
      coordination.push({
        workspaceId,
        todos: [...coord.todos.values()],
        claims: [...coord.claims.values()],
        worktrees: [...coord.worktrees.values()],
        rules: [...coord.rules.values()],
      })
    }
    return {
      v: STORE_VERSION,
      generatedAt: Date.now(),
      workspaces: this.listProjects().map((project) => ({ ...project })),
      chats: [...this.state.chatsById.values()]
        .filter((chat) => !chat.deletedAt)
        .map((chat) => ({ ...chat })),
      ...(coordination.length > 0 ? { coordination } : {}),
    }
  }

  async compact() {
    const snapshot = this.createSnapshot()
    await Bun.write(this.snapshotPath, JSON.stringify(snapshot, null, 2))
    await Promise.all([
      Bun.write(this.projectsLogPath, ""),
      Bun.write(this.chatsLogPath, ""),
      Bun.write(this.messagesLogPath, ""),
      Bun.write(this.turnsLogPath, ""),
      Bun.write(this.coordinationLogPath, ""),
    ])
  }

  async migrateLegacyTranscripts(onProgress?: (message: string) => void) {
    const stats = await this.getLegacyTranscriptStats()
    if (!stats.hasLegacyData) return false

    const sourceSummary = stats.sources.map((source) => source === "messages_log" ? "messages.jsonl" : "snapshot.json").join(", ")
    onProgress?.(`${LOG_PREFIX} transcript migration detected: ${stats.chatCount} chats, ${stats.entryCount} entries from ${sourceSummary}`)

    const messageSets = [...this.legacyMessagesByChatId.entries()]
    onProgress?.(`${LOG_PREFIX} transcript migration: writing ${messageSets.length} per-chat transcript files`)

    await mkdir(this.transcriptsDir, { recursive: true })
    const logEveryChat = messageSets.length <= 10
    for (let index = 0; index < messageSets.length; index += 1) {
      const [chatId, entries] = messageSets[index]
      const transcriptPath = this.transcriptPath(chatId)
      const tempPath = `${transcriptPath}.tmp`
      const payload = entries.map((entry) => JSON.stringify(entry)).join("\n")
      await writeFile(tempPath, payload ? `${payload}\n` : "", "utf8")
      await rename(tempPath, transcriptPath)
      if (logEveryChat || (index + 1) % 25 === 0 || index === messageSets.length - 1) {
        onProgress?.(`${LOG_PREFIX} transcript migration: ${index + 1}/${messageSets.length} chats`)
      }
    }

    this.clearLegacyTranscriptState()
    await this.compact()
    this.transcriptCache.clear()
    onProgress?.(`${LOG_PREFIX} transcript migration complete`)
    return true
  }

  private async shouldCompact() {
    const sizes = await Promise.all([
      Bun.file(this.projectsLogPath).size,
      Bun.file(this.chatsLogPath).size,
      Bun.file(this.messagesLogPath).size,
      Bun.file(this.turnsLogPath).size,
      Bun.file(this.coordinationLogPath).size,
    ])
    return sizes.reduce((total, size) => total + size, 0) >= COMPACTION_THRESHOLD_BYTES
  }
}
