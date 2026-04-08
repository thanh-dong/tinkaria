import { APP_NAME } from "../../shared/branding"
import type { ChatSnapshot, HydratedTranscriptMessage, SidebarChatRow, SidebarData } from "../../shared/types"
import type { SocketStatus } from "./socket-interface"

export interface PendingSessionBootstrap {
  chatId: string
  kind: "fork" | "merge"
  phase: "compacting" | "starting" | "error"
  sourceLabels: string[]
  errorMessage?: string
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
  | { kind: "project_id"; projectId: string }
  | { kind: "local_path"; localPath: string }
  | { kind: "project_request"; project: ProjectRequest }

export const TRANSCRIPT_TAIL_SIZE = 200
export const PWA_RESUME_STALE_AFTER_MS = 15_000

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

export function shouldStickToBottomOnComposerSubmit(distanceFromBottom: number, viewportHeight = 0) {
  return distanceFromBottom < Math.max(97, viewportHeight * 0.12)
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
