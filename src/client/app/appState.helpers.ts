import { APP_NAME } from "../../shared/branding"
import type { ChatSnapshot, HydratedTranscriptMessage, SidebarChatRow, SidebarData, TranscriptEntry } from "../../shared/types"
import type { AppTransport, SocketStatus } from "./socket-interface"

export interface ErrorAction {
  label: string
  variant: "default" | "ghost" | "destructive"
  action: string
}

export interface EnrichedError {
  message: string
  hint?: string
  actions?: ErrorAction[]
}

const DISMISS_ACTION: ErrorAction = { label: "Dismiss", variant: "ghost", action: "dismiss" }

export function enrichCommandError(raw: string): EnrichedError {
  const lower = raw.toLowerCase().trim()

  if (lower === "not connected") {
    return {
      message: "Can't reach the server",
      hint: `Make sure ${APP_NAME} is running on this machine.`,
      actions: [DISMISS_ACTION],
    }
  }

  if (lower.includes("connection closed") || lower.includes("socket closed")) {
    return {
      message: "Connection dropped",
      hint: "Reconnecting automatically...",
      actions: [DISMISS_ACTION],
    }
  }

  if (raw.includes("Unknown command type: system.readLocalFilePreview")) {
    return {
      message: "Client is newer than server",
      hint: `Restart ${APP_NAME} to enable in-app file previews.`,
      actions: [DISMISS_ACTION],
    }
  }

  return {
    message: raw.trim(),
    actions: [DISMISS_ACTION],
  }
}

export interface PendingSessionBootstrap {
  chatId: string
  kind: "fork" | "merge"
  phase: "compacting" | "starting" | "error"
  sourceLabels: string[]
  previewTitle: string
  previewIntent: string
  errorMessage?: string
}

const SESSION_BOOTSTRAP_PREVIEW_LIMIT = 180
const GENERIC_FORK_INTENT_PREFIXES = [
  "continue this work",
  "fork this into",
  "continue with",
]

function normalizeBootstrapText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function truncateBootstrapText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  const truncated = value.slice(0, Math.max(0, maxLength - 1)).trimEnd()
  return `${truncated}\u2026`
}

export function summarizeSessionBootstrapIntent(intent: string, maxLength = SESSION_BOOTSTRAP_PREVIEW_LIMIT): string {
  const normalized = normalizeBootstrapText(intent)
  if (!normalized) return ""
  const firstSentence = normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? normalized
  return truncateBootstrapText(firstSentence, maxLength)
}

function normalizeBootstrapTitleFragment(value: string | null | undefined): string | null {
  const normalized = value ? normalizeBootstrapText(value) : ""
  return normalized.length > 0 ? normalized : null
}

export function deriveForkSessionPreviewTitle(args: {
  sourceTitle?: string | null
  intent: string
}): string {
  const intentSummary = summarizeSessionBootstrapIntent(args.intent, 72)
  const sourceTitle = normalizeBootstrapTitleFragment(args.sourceTitle)
  const lowerIntent = intentSummary.toLowerCase()
  if (sourceTitle && GENERIC_FORK_INTENT_PREFIXES.some((prefix) => lowerIntent.startsWith(prefix))) {
    return `Fork: ${sourceTitle}`
  }
  if (intentSummary) return intentSummary
  if (sourceTitle) return `Fork: ${sourceTitle}`
  return "Forked session"
}

export function deriveMergeSessionPreviewTitle(args: {
  sourceLabels: string[]
  intent: string
}): string {
  const intentSummary = summarizeSessionBootstrapIntent(args.intent, 72)
  if (intentSummary) return intentSummary
  const labels = args.sourceLabels.map((label) => normalizeBootstrapText(label)).filter(Boolean)
  if (labels.length === 1) return `Merge: ${labels[0]}`
  if (labels.length === 2) return `Merge: ${labels[0]} + ${labels[1]}`
  if (labels.length > 2) return `Merge ${labels.length} sessions`
  return "Merged session"
}

export function transitionPendingSessionBootstrapToError(
  current: PendingSessionBootstrap | null,
  chatId: string,
  errorMessage: string,
): PendingSessionBootstrap | null {
  if (current?.chatId !== chatId) return current
  return {
    ...current,
    phase: "error",
    errorMessage,
  }
}

export function clearPendingSessionBootstrapAfterAttempt(
  current: PendingSessionBootstrap | null,
  chatId: string,
): PendingSessionBootstrap | null {
  if (current?.chatId !== chatId) return current
  return current.phase === "error" ? current : null
}

export interface TranscriptWindowDiagnostics {
  totalCount: number
  renderableCount: number
  hiddenCount: number
  statusCount: number
  metadataOnlyCount: number
}

export interface ProjectRequest {
  mode: "new" | "existing"
  localPath: string
  title: string
}

export type StartChatIntent =
  | { kind: "project_id"; workspaceId: string }
  | { kind: "local_path"; localPath: string }
  | { kind: "project_request"; project: ProjectRequest }

export const TRANSCRIPT_TAIL_SIZE = 200
export const PWA_RESUME_STALE_AFTER_MS = 15_000
export const SNAPSHOT_RECOVERY_TIMEOUT_MS = 5_000
export const MIN_TRANSCRIPT_FETCH_CHUNK_SIZE = 1

function isTranscriptPayloadLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes("max_payload")
}

export async function fetchTranscriptRange(args: {
  socket: AppTransport
  chatId: string
  offset: number
  limit: number
  timeoutMs?: number
}): Promise<TranscriptEntry[]> {
  if (args.limit <= 0) return []

  const entries: TranscriptEntry[] = []
  const end = args.offset + args.limit
  let cursor = args.offset
  let chunkSize = args.limit

  while (cursor < end) {
    const remaining = end - cursor
    const requestLimit = Math.min(chunkSize, remaining)
    try {
      const chunk = await args.socket.command<TranscriptEntry[]>({
        type: "chat.getMessages",
        chatId: args.chatId,
        offset: cursor,
        limit: requestLimit,
      }, args.timeoutMs ? { timeoutMs: args.timeoutMs } : undefined)
      if (chunk.length === 0) break
      for (const entry of chunk) entries.push(entry)
      cursor += chunk.length
    } catch (error) {
      if (!isTranscriptPayloadLimitError(error) || requestLimit <= MIN_TRANSCRIPT_FETCH_CHUNK_SIZE) {
        throw error
      }
      chunkSize = Math.max(MIN_TRANSCRIPT_FETCH_CHUNK_SIZE, Math.floor(requestLimit / 2))
    }
  }

  return entries
}

export async function fetchTranscriptMessageCount(args: {
  socket: AppTransport
  chatId: string
  timeoutMs?: number
}): Promise<number> {
  const result = await args.socket.command<{ messageCount: number }>({
    type: "chat.getMessageCount",
    chatId: args.chatId,
  }, args.timeoutMs ? { timeoutMs: args.timeoutMs } : undefined)

  return result.messageCount
}

export async function fetchExternalSessionTranscript(args: {
  socket: AppTransport
  parentChatId: string
  sessionId: string
  timeoutMs?: number
}): Promise<TranscriptEntry[]> {
  return await args.socket.command<TranscriptEntry[]>({
    type: "chat.getExternalSessionMessages",
    parentChatId: args.parentChatId,
    sessionId: args.sessionId,
  }, args.timeoutMs ? { timeoutMs: args.timeoutMs } : undefined)
}

export function removeChatFromSidebar(data: SidebarData, chatId: string): SidebarData {
  const filtered = data.workspaceGroups
    .map((group) => {
      const chats = group.chats.filter((chat) => chat.chatId !== chatId)
      return chats.length === group.chats.length ? group : { ...group, chats }
    })
    .filter((group) => group.chats.length > 0)

  return filtered.length === data.workspaceGroups.length && filtered.every((g, i) => g === data.workspaceGroups[i])
    ? data
    : { workspaceGroups: filtered, independentWorkspaces: data.independentWorkspaces }
}

export function filterPendingDeletedChats(data: SidebarData, pendingDeletedChatIds: ReadonlySet<string>): SidebarData {
  if (pendingDeletedChatIds.size === 0) return data
  const filtered = data.workspaceGroups
    .map((group) => {
      const chats = group.chats.filter((chat) => !pendingDeletedChatIds.has(chat.chatId))
      return chats.length === group.chats.length ? group : { ...group, chats }
    })
    .filter((group) => group.chats.length > 0)

  return filtered.length === data.workspaceGroups.length && filtered.every((g, i) => g === data.workspaceGroups[i])
    ? data
    : { workspaceGroups: filtered, independentWorkspaces: data.independentWorkspaces }
}

export function getNewestRemainingChatId(workspaceGroups: SidebarData["workspaceGroups"], activeChatId: string): string | null {
  const projectGroup = workspaceGroups.find((group) => group.chats.some((chat) => chat.chatId === activeChatId))
  if (!projectGroup) return null

  return projectGroup.chats.find((chat) => chat.chatId !== activeChatId)?.chatId ?? null
}

export function getSidebarChatRow(
  workspaceGroups: SidebarData["workspaceGroups"],
  activeChatId: string | null
): SidebarChatRow | null {
  if (!activeChatId) return null

  for (const group of workspaceGroups) {
    const chat = group.chats.find((candidate) => candidate.chatId === activeChatId)
    if (chat) return chat
  }

  return null
}

export function getSidebarChatLabels(
  workspaceGroups: SidebarData["workspaceGroups"],
  chatIds: string[],
): string[] {
  return chatIds.map((chatId) => getSidebarChatRow(workspaceGroups, chatId)?.title?.trim() || chatId)
}

export function shouldStickToBottomOnComposerSubmit(distanceFromBottom: number, viewportHeight = 0) {
  return distanceFromBottom < Math.max(97, viewportHeight * 0.12)
}

export function getUiUpdateRestartReconnectAction(
  phase: string | null,
  connectionStatus: SocketStatus
): "none" | "awaiting_reconnect" | "navigate_home" {
  if (phase === "awaiting_disconnect" && connectionStatus === "disconnected") {
    return "awaiting_reconnect"
  }

  if (phase === "awaiting_reconnect" && connectionStatus === "connected") {
    return "navigate_home"
  }

  return "none"
}

export function computeTailOffset(messageCount: number, tailSize = TRANSCRIPT_TAIL_SIZE): number {
  return Math.max(0, messageCount - tailSize)
}

export function hasRenderableTranscriptHistory(messages: HydratedTranscriptMessage[]): boolean {
  return messages.some((message) => {
    if (message.hidden) return false

    switch (message.kind) {
      case "system_init":
      case "account_info":
      case "status":
      case "compact_boundary":
        return false
      default:
        return true
    }
  })
}

export function summarizeTranscriptWindow(messages: HydratedTranscriptMessage[]): TranscriptWindowDiagnostics {
  let renderableCount = 0
  let hiddenCount = 0
  let statusCount = 0
  let metadataOnlyCount = 0

  for (const message of messages) {
    if (message.hidden) {
      hiddenCount += 1
      continue
    }

    switch (message.kind) {
      case "status":
        statusCount += 1
        metadataOnlyCount += 1
        break
      case "system_init":
      case "account_info":
      case "compact_boundary":
        metadataOnlyCount += 1
        break
      default:
        renderableCount += 1
        break
    }
  }

  return {
    totalCount: messages.length,
    renderableCount,
    hiddenCount,
    statusCount,
    metadataOnlyCount,
  }
}

export function shouldBackfillTranscriptWindow(args: {
  messages: HydratedTranscriptMessage[]
  messageCount: number
  offset: number
}): boolean {
  if (args.messageCount <= 0) return false
  if (args.offset <= 0) return false
  return !hasRenderableTranscriptHistory(args.messages)
}

export function shouldRefreshStaleSessionOnResume(args: {
  isStandalone: boolean
  hiddenAt: number | null
  resumedAt: number
  connectionStatus: SocketStatus
}): boolean {
  if (!args.isStandalone) return false
  if (args.connectionStatus !== "connected") return true
  if (args.hiddenAt === null) return false
  return Math.max(0, args.resumedAt - args.hiddenAt) >= PWA_RESUME_STALE_AFTER_MS
}

export function normalizeLocalFilePreviewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Unknown command type: system.readLocalFilePreview")) {
    return `This ${APP_NAME} browser client is newer than the running server. Restart ${APP_NAME} to enable in-app file previews.`
  }
  return message
}

export function normalizeCommandErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  const lower = normalized.toLowerCase()

  if (lower === "not connected") {
    return `Can't reach your local ${APP_NAME} server yet. Wait a moment, or start ${APP_NAME} in a terminal on this machine and try again.`
  }

  if (lower.includes("connection closed") || lower.includes("socket closed")) {
    return `The connection to your local ${APP_NAME} server dropped. ${APP_NAME} will keep trying to reconnect.`
  }

  return normalized
}

export function normalizeSessionBootstrapErrorMessage(
  kind: PendingSessionBootstrap["kind"],
  error: unknown,
): string {
  const normalized = normalizeCommandErrorMessage(error)
  const lower = normalized.toLowerCase()

  if (lower.includes("timeout") || lower.includes("timed out")) {
    if (kind === "fork") {
      return "Preparing the fork brief took too long. Try again with a tighter focus or a smaller source context."
    }
    return "Preparing the merged session brief took too long. Try again with fewer sessions or a tighter goal."
  }

  if (lower.includes("busy") || lower.includes("already running")) {
    return "The target session is currently busy. Wait for it to finish or pick a different session."
  }

  return normalized
}

export function shouldFlushQueuedText(args: {
  activeChatId: string | null
  queuedChatId: string | null
  queuedText: string
  isProcessing: boolean
  isFlushInFlight: boolean
  isAwaitingPostFlushBusy: boolean
}): boolean {
  if (args.isProcessing || args.isFlushInFlight || args.isAwaitingPostFlushBusy) return false
  if (args.activeChatId === null || args.queuedChatId === null) return false
  if (args.activeChatId !== args.queuedChatId) return false
  return args.queuedText.trim().length > 0
}

export function resolveComposeIntent(params: {
  selectedProjectId: string | null
  sidebarProjectId?: string | null
  fallbackLocalProjectPath?: string | null
}): StartChatIntent | null {
  const workspaceId = params.selectedProjectId ?? params.sidebarProjectId ?? null
  if (workspaceId) {
    return { kind: "project_id", workspaceId }
  }

  if (params.fallbackLocalProjectPath) {
    return { kind: "local_path", localPath: params.fallbackLocalProjectPath }
  }

  return null
}

export function getActiveChatSnapshot(chatSnapshot: ChatSnapshot | null, activeChatId: string | null): ChatSnapshot | null {
  if (!chatSnapshot) return null
  if (!activeChatId) return null
  if (chatSnapshot.runtime.chatId !== activeChatId) {
    console.info("[useAppState] stale snapshot masked", {
      routeChatId: activeChatId,
      snapshotChatId: chatSnapshot.runtime.chatId,
      snapshotProvider: chatSnapshot.runtime.provider,
    })
    return null
  }
  return chatSnapshot
}

export function appendQueuedText(currentQueuedText: string, nextContent: string): string {
  const current = currentQueuedText.trim()
  const next = nextContent.trim()

  if (!current) return next
  if (!next) return current

  return `${current}\n\n${next}`
}

export function shouldTriggerSnapshotRecovery(args: {
  cancelled: boolean
  initialFetchDone: boolean
  fetchTriggered: boolean
}): boolean {
  return !args.cancelled && !args.initialFetchDone && !args.fetchTriggered
}

export function shouldQueueChatSubmit(isProcessing: boolean, queuedText: string): boolean {
  return isProcessing || queuedText.trim().length > 0
}

export function prependQueuedText(flushedText: string, queuedText: string): string {
  return appendQueuedText(flushedText, queuedText)
}

export function shouldPreserveMessagesOnResubscribe(args: {
  hasExistingMessages: boolean
  restoredFromCache: boolean
  currentMessagesChatId: string | null
  nextChatId: string | null
}): boolean {
  return args.hasExistingMessages
    && !args.restoredFromCache
    && args.currentMessagesChatId !== null
    && args.currentMessagesChatId === args.nextChatId
}
