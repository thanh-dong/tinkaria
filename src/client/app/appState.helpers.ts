import { APP_NAME } from "../../shared/branding"
import type { ChatSnapshot, HydratedTranscriptMessage, SidebarChatRow, SidebarData } from "../../shared/types"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import type { SocketStatus } from "./socket-interface"

// --- Types ---

export interface ReadBlockBoundary {
  messageId: string
  blockIndex: number
}

export type BoundaryComparison = "advance" | "same" | "regress"

export type ReadHookProgressState = "reading" | "read"

export interface ReadHookProgressBoundary extends ReadBlockBoundary {
  state: ReadHookProgressState
}

export interface PendingSessionBootstrap {
  chatId: string
  kind: "fork" | "merge"
  phase: "compacting" | "starting"
  sourceLabels: string[]
}

export type InitialChatReadAnchor =
  | { kind: "wait" }
  | { kind: "tail" }
  | ({ kind: "block" } & ReadBlockBoundary)

export interface LockedAnchorState {
  chatId: string | null
  anchor: InitialChatReadAnchor
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
  | { kind: "project_id"; projectId: string }
  | { kind: "local_path"; localPath: string }
  | { kind: "project_request"; project: ProjectRequest }

// --- Constants ---

export const COMPOSER_STICK_DISTANCE_RATIO = 0.12
export const READ_HOOK_READING_START_RATIO = 0.5
export const READ_HOOK_READ_START_RATIO = 0.75
export const TRANSCRIPT_TAIL_SIZE = 200
export const PWA_RESUME_STALE_AFTER_MS = 15_000

// --- Pure helper functions ---

export function getNewestRemainingChatId(projectGroups: SidebarData["projectGroups"], activeChatId: string): string | null {
  const projectGroup = projectGroups.find((group) => group.chats.some((chat) => chat.chatId === activeChatId))
  if (!projectGroup) return null

  return projectGroup.chats.find((chat) => chat.chatId !== activeChatId)?.chatId ?? null
}

export function getSidebarChatRow(
  projectGroups: SidebarData["projectGroups"],
  activeChatId: string | null
): SidebarChatRow | null {
  if (!activeChatId) return null

  for (const group of projectGroups) {
    const chat = group.chats.find((candidate) => candidate.chatId === activeChatId)
    if (chat) return chat
  }

  return null
}

export function getSidebarChatLabels(
  projectGroups: SidebarData["projectGroups"],
  chatIds: string[],
): string[] {
  return chatIds.map((chatId) => getSidebarChatRow(projectGroups, chatId)?.title?.trim() || chatId)
}

export function isChatRead(lastSeenMessageAt?: number, lastMessageAt?: number): boolean {
  if (lastMessageAt === undefined) return true
  return (lastSeenMessageAt ?? Number.NEGATIVE_INFINITY) >= lastMessageAt
}

export function getReadTimestampToPersistAfterReply(lastSeenMessageAt?: number, lastMessageAt?: number): number | null {
  if (lastMessageAt === undefined) return null
  if ((lastSeenMessageAt ?? Number.NEGATIVE_INFINITY) >= lastMessageAt) return null
  return lastMessageAt
}

export function compareReadBoundary(
  messages: HydratedTranscriptMessage[],
  current: { messageId?: string; blockIndex?: number },
  next: { messageId: string; blockIndex: number },
): BoundaryComparison {
  if (messages.length === 0) return "same"

  const nextIndex = messages.findIndex((m) => m.id === next.messageId)
  if (nextIndex < 0) return "same"

  if (!current.messageId) return "advance"

  const currentIndex = messages.findIndex((m) => m.id === current.messageId)
  if (currentIndex < 0) return "advance"

  if (nextIndex > currentIndex) return "advance"
  if (nextIndex < currentIndex) return "regress"

  const currentBlock = current.blockIndex ?? 0
  if (next.blockIndex > currentBlock) return "advance"
  if (next.blockIndex < currentBlock) return "regress"

  return "same"
}

export function isReadableTranscriptMessage(message: HydratedTranscriptMessage): boolean {
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
}

export function getLastReadableMessage(messages: HydratedTranscriptMessage[]): HydratedTranscriptMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isReadableTranscriptMessage(message)) return message
  }

  return null
}

export function getReadableBlockCount(message: HydratedTranscriptMessage): number {
  if (!isReadableTranscriptMessage(message)) return 0
  if (message.kind !== "assistant_text") return 1

  try {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(message.text) as { children?: Array<{ type?: string; children?: unknown[] }> }
    const nodes = tree.children ?? []
    let count = 0
    for (const node of nodes) {
      if (node.type === "list") {
        const items = Array.isArray(node.children) ? node.children.length : 0
        count += Math.max(1, items)
        continue
      }
      count += 1
    }
    return Math.max(1, count)
  } catch {
    return 1
  }
}

export function getNextReadableBoundary(args: {
  messages: HydratedTranscriptMessage[]
  lastReadMessageId?: string
  lastReadBlockIndex?: number
  lastSeenMessageAt?: number
  lastMessageAt?: number
}): ReadBlockBoundary | null {
  const readableMessages = args.messages.filter(isReadableTranscriptMessage)
  if (readableMessages.length === 0) return null

  if (isChatRead(args.lastSeenMessageAt, args.lastMessageAt)) return null

  if (args.lastReadMessageId) {
    const messageIndex = readableMessages.findIndex((message) => message.id === args.lastReadMessageId)
    if (messageIndex >= 0) {
      const currentMessage = readableMessages[messageIndex]
      const nextBlockIndex = (args.lastReadBlockIndex ?? 0) + 1
      if (nextBlockIndex < getReadableBlockCount(currentMessage)) {
        return { messageId: currentMessage.id, blockIndex: nextBlockIndex }
      }

      const nextMessage = readableMessages[messageIndex + 1]
      if (nextMessage) {
        return { messageId: nextMessage.id, blockIndex: 0 }
      }
      return null
    }
  }

  return { messageId: readableMessages[0].id, blockIndex: 0 }
}

export function getInitialChatReadAnchor(args: {
  activeChatId: string | null
  sidebarReady: boolean
  hasSidebarChat: boolean
  messages: HydratedTranscriptMessage[]
  lastReadMessageId?: string
  lastReadBlockIndex?: number
  lastSeenMessageAt?: number
  lastMessageAt?: number
}): InitialChatReadAnchor {
  if (args.activeChatId && (!args.sidebarReady || !args.hasSidebarChat)) return { kind: "wait" }

  const nextBoundary = getNextReadableBoundary({
    messages: args.messages,
    lastReadMessageId: args.lastReadMessageId,
    lastReadBlockIndex: args.lastReadBlockIndex,
    lastSeenMessageAt: args.lastSeenMessageAt,
    lastMessageAt: args.lastMessageAt,
  })

  if (nextBoundary) {
    return { kind: "block", ...nextBoundary }
  }

  return { kind: "tail" }
}

export function getLockedInitialChatReadAnchor(
  current: InitialChatReadAnchor,
  next: InitialChatReadAnchor,
  initialScrollCompleted: boolean,
): InitialChatReadAnchor {
  if (initialScrollCompleted) return current
  if (next.kind === "wait") return current
  return current.kind === "wait" ? next : current
}

export function resolveLockedAnchor(
  state: LockedAnchorState,
  chatId: string | null,
  nextAnchor: InitialChatReadAnchor,
  scrollCompleted: boolean,
): LockedAnchorState {
  if (chatId !== state.chatId) {
    return resolveLockedAnchor({ chatId, anchor: { kind: "wait" } }, chatId, nextAnchor, false)
  }

  const locked = getLockedInitialChatReadAnchor(state.anchor, nextAnchor, scrollCompleted)
  return { chatId, anchor: locked }
}

export function getViewportRatioThresholdPx(viewportHeight: number, ratio: number, minimumPx: number): number {
  return Math.max(minimumPx, viewportHeight * ratio)
}

export function getHookReadProgressBoundary(container: HTMLElement): ReadHookProgressBoundary | null {
  const blockNodes = Array.from(container.querySelectorAll<HTMLElement>("[data-read-anchor-message-id][data-read-anchor-block-index]"))
  if (blockNodes.length === 0) return null

  const viewportRect = container.getBoundingClientRect()
  const viewportHeight = Math.max(0, viewportRect.height)
  const viewportBottom = viewportRect.bottom - 8
  const readingThresholdTop = viewportRect.top + viewportHeight * READ_HOOK_READING_START_RATIO
  const readThresholdTop = viewportRect.top + viewportHeight * READ_HOOK_READ_START_RATIO
  let candidate: ReadHookProgressBoundary | null = null

  for (const node of blockNodes) {
    const messageId = node.dataset.readAnchorMessageId
    const rawBlockIndex = node.dataset.readAnchorBlockIndex
    const blockIndex = rawBlockIndex ? Number.parseInt(rawBlockIndex, 10) : Number.NaN
    if (!messageId || !Number.isFinite(blockIndex)) continue

    const rect = node.getBoundingClientRect()
    if (rect.top < readingThresholdTop || rect.top > viewportBottom) continue
    candidate = {
      messageId,
      blockIndex,
      state: rect.top >= readThresholdTop ? "read" : "reading",
    }
  }

  return candidate
}

export function shouldStickToBottomOnComposerSubmit(distanceFromBottom: number, viewportHeight = 0) {
  return distanceFromBottom < getViewportRatioThresholdPx(viewportHeight, COMPOSER_STICK_DISTANCE_RATIO, 97)
}

export function getUiUpdateRestartReconnectAction(
  phase: string | null,
  connectionStatus: SocketStatus
): "none" | "awaiting_reconnect" | "navigate_changelog" {
  if (phase === "awaiting_disconnect" && connectionStatus === "disconnected") {
    return "awaiting_reconnect"
  }

  if (phase === "awaiting_reconnect" && connectionStatus === "connected") {
    return "navigate_changelog"
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

export function getResumeRefreshSessionProjectIds(openSessionProjectIds: Iterable<string>): string[] {
  return [...new Set(openSessionProjectIds)]
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
  const projectId = params.selectedProjectId ?? params.sidebarProjectId ?? null
  if (projectId) {
    return { kind: "project_id", projectId }
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

export function shouldQueueChatSubmit(isProcessing: boolean, queuedText: string): boolean {
  return isProcessing || queuedText.trim().length > 0
}

export function prependQueuedText(flushedText: string, queuedText: string): string {
  return appendQueuedText(flushedText, queuedText)
}
