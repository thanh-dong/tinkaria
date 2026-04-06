import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import {
  PROVIDERS,
  type AgentProvider,
  type AskUserQuestionAnswerMap,
  type CurrentRepoStatusSnapshot,
  type CurrentSessionSnapshot,
  type ModelOptions,
  type ProviderCatalogEntry,
  type SessionsSnapshot,
  type UpdateInstallResult,
  type UpdateSnapshot,
} from "../../shared/types"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import { useChatReadStateStore } from "../stores/chatReadStateStore"
import { useRightSidebarStore } from "../stores/rightSidebarStore"
import { useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useChatInputStore } from "../stores/chatInputStore"
import type { ChatMessageEvent, ChatSnapshot, HydratedTranscriptMessage, LocalProjectsSnapshot, SidebarChatRow, SidebarData, TranscriptEntry } from "../../shared/types"
import type { LocalFilePreview } from "../components/messages/LocalFilePreviewDialog"
import type { AskUserQuestionItem } from "../components/messages/types"
import { useAppDialog } from "../components/ui/app-dialog"
import { createIncrementalHydrator, processTranscriptMessages } from "../lib/parseTranscript"
import type { IncrementalHydrator } from "../lib/parseTranscript"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import {
  clearQueuedSubmit,
  completeQueuedFlush,
  createProjectSelectionState,
  createSubmitPipelineState,
  failQueuedFlush,
  getQueuedText,
  getSubmitPipelineMode,
  markPostFlushBusyObserved,
  resolveProjectSelection,
  startQueuedFlush,
  type SubmitPipelineState,
  transitionProjectSelection,
  queueSubmit as queueSubmitTransition,
} from "./useTinkariaState.machine"
import { NatsSocket } from "./nats-socket"
import type { TinkariaTransport, SocketStatus } from "./socket-interface"

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

export function isChatRead(lastSeenMessageAt?: number, lastMessageAt?: number): boolean {
  if (lastMessageAt === undefined) return true
  return (lastSeenMessageAt ?? Number.NEGATIVE_INFINITY) >= lastMessageAt
}

export function getReadTimestampToPersistAfterReply(lastSeenMessageAt?: number, lastMessageAt?: number): number | null {
  if (lastMessageAt === undefined) return null
  if ((lastSeenMessageAt ?? Number.NEGATIVE_INFINITY) >= lastMessageAt) return null
  return lastMessageAt
}

export interface ReadBlockBoundary {
  messageId: string
  blockIndex: number
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

export function getVisibleReadBlockBoundary(container: HTMLElement): ReadBlockBoundary | null {
  const blockNodes = Array.from(container.querySelectorAll<HTMLElement>("[data-read-anchor-message-id][data-read-anchor-block-index]"))
  if (blockNodes.length === 0) return null

  const viewportRect = container.getBoundingClientRect()
  const viewportTop = viewportRect.top + 8
  const viewportBottom = viewportRect.bottom - 8

  let firstBelowTop: { top: number; boundary: ReadBlockBoundary } | null = null
  let closestAbove: { distance: number; boundary: ReadBlockBoundary } | null = null

  for (const node of blockNodes) {
    const messageId = node.dataset.readAnchorMessageId
    const rawBlockIndex = node.dataset.readAnchorBlockIndex
    const blockIndex = rawBlockIndex ? Number.parseInt(rawBlockIndex, 10) : Number.NaN
    if (!messageId || !Number.isFinite(blockIndex)) continue

    const rect = node.getBoundingClientRect()
    if (rect.bottom > viewportTop && rect.top < viewportBottom) {
      return { messageId, blockIndex }
    }

    if (rect.top <= viewportTop) {
      const distance = viewportTop - rect.top
      if (!closestAbove || distance < closestAbove.distance) {
        closestAbove = { distance, boundary: { messageId, blockIndex } }
      }
      continue
    }

    if (!firstBelowTop || rect.top < firstBelowTop.top) {
      firstBelowTop = { top: rect.top, boundary: { messageId, blockIndex } }
    }
  }

  return closestAbove?.boundary ?? firstBelowTop?.boundary ?? null
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

export type InitialChatReadAnchor =
  | { kind: "wait" }
  | { kind: "tail" }
  | ({ kind: "block" } & ReadBlockBoundary)

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

function useTinkariaSocket(): TinkariaTransport {
  const socketRef = useRef<TinkariaTransport | null>(null)
  if (!socketRef.current) {
    socketRef.current = new NatsSocket()
  }

  useEffect(() => {
    const socket = socketRef.current
    socket?.start()
    return () => {
      socket?.dispose()
    }
  }, [])

  return socketRef.current as TinkariaTransport
}

function logTinkariaState(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[useTinkariaState] ${message}`)
    return
  }

  console.info(`[useTinkariaState] ${message}`, details)
}

export function shouldAutoFollowTranscript(distanceFromBottom: number) {
  return distanceFromBottom < 24
}

export function shouldStickToBottomOnComposerSubmit(distanceFromBottom: number) {
  return distanceFromBottom < 97
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

export const TRANSCRIPT_TAIL_SIZE = 200
export const PWA_RESUME_STALE_AFTER_MS = 15_000
const RESUME_REFRESH_DEDUP_WINDOW_MS = 1_000

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

export interface TranscriptWindowDiagnostics {
  totalCount: number
  renderableCount: number
  hiddenCount: number
  statusCount: number
  metadataOnlyCount: number
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

function isStandalonePwaDisplay(): boolean {
  if (typeof window === "undefined") return false

  const isIOSStandalone = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true
  const isDisplayStandalone = window.matchMedia("(display-mode: standalone)").matches
  return isIOSStandalone || isDisplayStandalone
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

// --- Per-chat message cache ---
// Preserves hydrator + messages across chat switches so stale content
// renders instantly while fresh data is fetched (stale-while-revalidate).

export interface CachedChatState {
  hydrator: IncrementalHydrator
  messages: HydratedTranscriptMessage[]
  messageCount: number
  cachedAt: number
  lastMessageAt: number | undefined
  stale: boolean
}

const chatCache = new Map<string, CachedChatState>()
export const MAX_CACHED_CHATS = 10

export function getCachedChat(chatId: string): CachedChatState | null {
  return chatCache.get(chatId) ?? null
}

export function setCachedChat(chatId: string, state: CachedChatState): void {
  // Delete first so re-insert moves to end (preserves insertion order for LRU)
  chatCache.delete(chatId)
  chatCache.set(chatId, state)

  if (chatCache.size > MAX_CACHED_CHATS) {
    const oldest = chatCache.keys().next().value
    if (oldest !== undefined) chatCache.delete(oldest)
  }
}

export function deleteCachedChat(chatId: string): void {
  chatCache.delete(chatId)
}

export function clearChatCache(): void {
  chatCache.clear()
}

export function markCachedChatsStale(sidebarChats: Array<{ chatId: string; lastMessageAt?: number }>): void {
  const chatMap = new Map(sidebarChats.map((c) => [c.chatId, c]))
  for (const [chatId, cached] of chatCache) {
    if (cached.stale) continue
    const sidebarChat = chatMap.get(chatId)
    if (!sidebarChat || sidebarChat.lastMessageAt === undefined || cached.lastMessageAt === undefined) continue
    if (sidebarChat.lastMessageAt > cached.lastMessageAt) {
      setCachedChat(chatId, { ...cached, stale: true })
    }
  }
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

export function normalizeLocalFilePreviewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("Unknown command type: system.readLocalFilePreview")) {
    return `This ${APP_NAME} browser client is newer than the running server. Restart ${APP_NAME} to enable in-app file previews.`
  }
  return message
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

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320
const UI_UPDATE_RESTART_STORAGE_KEY = "tinkaria:ui-update-restart"

function getUiUpdateRestartPhase() {
  return window.sessionStorage.getItem(UI_UPDATE_RESTART_STORAGE_KEY)
}

function setUiUpdateRestartPhase(phase: "awaiting_disconnect" | "awaiting_reconnect") {
  window.sessionStorage.setItem(UI_UPDATE_RESTART_STORAGE_KEY, phase)
}

function clearUiUpdateRestartPhase() {
  window.sessionStorage.removeItem(UI_UPDATE_RESTART_STORAGE_KEY)
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
    logTinkariaState("stale snapshot masked", {
      routeChatId: activeChatId,
      snapshotChatId: chatSnapshot.runtime.chatId,
      snapshotProvider: chatSnapshot.runtime.provider,
    })
    return null
  }
  return chatSnapshot
}

export interface TinkariaState {
  socket: TinkariaTransport
  activeChatId: string | null
  sidebarData: SidebarData
  localProjects: LocalProjectsSnapshot | null
  updateSnapshot: UpdateSnapshot | null
  chatSnapshot: ChatSnapshot | null
  connectionStatus: SocketStatus
  sidebarReady: boolean
  localProjectsReady: boolean
  commandError: string | null
  startingLocalPath: string | null
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLDivElement | null>
  messages: HydratedTranscriptMessage[]
  latestToolIds: ReturnType<typeof getLatestToolIds>
  runtime: ChatSnapshot["runtime"] | null
  currentSessionRuntime: CurrentSessionSnapshot["runtime"]
  currentRepoStatus: CurrentRepoStatusSnapshot | null
  currentAccountInfo: Extract<HydratedTranscriptMessage, { kind: "account_info" }>["accountInfo"] | null
  availableProviders: ProviderCatalogEntry[]
  isProcessing: boolean
  canCancel: boolean
  queuedText: string
  transcriptPaddingBottom: number
  showScrollButton: boolean
  initialReadAnchorMessageId: string | null
  initialReadAnchorBlockIndex: number | null
  navbarLocalPath?: string
  hasSelectedProject: boolean
  chatHasKnownMessages: boolean
  localFilePreview: LocalFilePreview | null
  openSidebar: () => void
  closeSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
  closeLocalFilePreview: () => void
  handleInitialReadAnchorScrolled: () => void
  updateScrollState: () => void
  scrollToBottom: () => void
  handleCreateChat: (projectId: string) => Promise<void>
  handleOpenLocalProject: (localPath: string) => Promise<void>
  handleCreateProject: (project: ProjectRequest) => Promise<void>
  handleCheckForUpdates: (options?: { force?: boolean }) => Promise<void>
  handleInstallUpdate: () => Promise<void>
  handleSend: (content: string, options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }) => Promise<void>
  handleSubmitFromComposer: (
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<"queued" | "sent">
  handleCancel: () => Promise<void>
  clearQueuedText: () => void
  restoreQueuedText: () => string
  handleDeleteChat: (chat: SidebarChatRow) => Promise<void>
  handleRemoveProject: (projectId: string) => Promise<void>
  handleOpenExternal: (action: "open_finder") => Promise<void>
  handleOpenExternalPath: (action: "open_finder", localPath: string) => Promise<void>
  handleOpenLocalLink: (target: { path: string; line?: number; column?: number }) => Promise<void>
  handleOpenExternalLink: (href: string) => boolean
  handleRenameChat: (chatId: string, title: string) => Promise<void>
  sessionsSnapshots: Map<string, SessionsSnapshot>
  sessionsWindowDays: Map<string, number>
  handleOpenSessionPicker: (projectId: string, open: boolean) => void
  handleResumeSession: (projectId: string, sessionId: string, provider: AgentProvider) => Promise<void>
  handleRefreshSessions: (projectId: string) => void
  handleShowMoreSessions: (projectId: string) => void
  handleCompose: () => void
  handleAskUserQuestion: (
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) => Promise<void>
  handleExitPlanMode: (
    toolUseId: string,
    confirmed: boolean,
    clearContext?: boolean,
    message?: string
  ) => Promise<void>
}

export function useTinkariaState(activeChatId: string | null): TinkariaState {
  const navigate = useNavigate()
  const socket = useTinkariaSocket()
  const dialog = useAppDialog()

  const [sidebarData, setSidebarData] = useState<SidebarData>({ projectGroups: [] })
  const [localProjects, setLocalProjects] = useState<LocalProjectsSnapshot | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [chatSnapshot, setChatSnapshot] = useState<ChatSnapshot | null>(null)
  const [currentSessionRuntime, setCurrentSessionRuntime] = useState<CurrentSessionSnapshot["runtime"]>(null)
  const [currentRepoStatus, setCurrentRepoStatus] = useState<CurrentRepoStatusSnapshot | null>(null)
  const hydratorRef = useRef<IncrementalHydrator>(createIncrementalHydrator())
  const [messages, setMessages] = useState<HydratedTranscriptMessage[]>([])
  const messagesRef = useRef<HydratedTranscriptMessage[]>(messages)
  const messageCountRef = useRef(0)
  const [connectionStatus, setConnectionStatus] = useState<SocketStatus>("connecting")
  const [sidebarReady, setSidebarReady] = useState(false)
  const [localProjectsReady, setLocalProjectsReady] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const [projectSelection, setProjectSelection] = useState(createProjectSelectionState)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputHeight, setInputHeight] = useState(148)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [startingLocalPath, setStartingLocalPath] = useState<string | null>(null)
  const [pendingChatId, setPendingChatId] = useState<string | null>(null)
  const submitPipelineRef = useRef<SubmitPipelineState>(createSubmitPipelineState({
    queuedTextByChat: Object.fromEntries(
      Object.entries(useChatInputStore.getState().queuedDrafts).map(([chatId, draft]) => [chatId, draft.text])
    ),
    optionsByChat: Object.fromEntries(
      Object.entries(useChatInputStore.getState().queuedDrafts).map(([chatId, draft]) => [chatId, draft.options])
    ),
  }))
  const [submitPipeline, setSubmitPipeline] = useState<SubmitPipelineState>(submitPipelineRef.current)
  const [localFilePreview, setLocalFilePreview] = useState<LocalFilePreview | null>(null)
  const [sessionsSnapshots, setSessionsSnapshots] = useState<Map<string, SessionsSnapshot>>(new Map())
  const [sessionsWindowDays, setSessionsWindowDays] = useState<Map<string, number>>(new Map())
  const [resumeRefreshNonce, setResumeRefreshNonce] = useState(0)
  const activeSessionsSubs = useRef<Map<string, () => void>>(new Map())
  const backgroundedAtRef = useRef<number | null>(null)
  const lastResumeRefreshAtRef = useRef(0)
  const lastReadBlockIndex = useChatReadStateStore((store) => (
    activeChatId ? store.lastReadBlockIndexByChat[activeChatId] : undefined
  ))
  const lastReadMessageId = useChatReadStateStore((store) => (
    activeChatId ? store.lastReadMessageIdByChat[activeChatId] : undefined
  ))
  const lastSeenMessageAt = useChatReadStateStore((store) => (
    activeChatId ? store.lastSeenMessageAtByChat[activeChatId] : undefined
  ))
  const markChatRead = useChatReadStateStore((store) => store.markChatRead)
  const clearChatReadState = useChatReadStateStore((store) => store.clearChat)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const initialScrollCompletedRef = useRef(false)
  const initialScrollFrameRef = useRef<number | null>(null)
  const activeQueuedText = getQueuedText(submitPipeline, activeChatId)

  function updateSubmitPipeline(updater: (current: SubmitPipelineState) => SubmitPipelineState): SubmitPipelineState {
    const next = updater(submitPipelineRef.current)
    submitPipelineRef.current = next
    setSubmitPipeline(next)
    useChatInputStore.getState().syncQueuedDrafts(
      Object.fromEntries(
        Object.entries(next.queuedTextByChat).flatMap(([chatId, text]) => {
          const trimmed = text.trim()
          if (!trimmed) return []
          return [[chatId, {
            text: trimmed,
            updatedAt: Date.now(),
            options: next.optionsByChat[chatId],
          }]]
        })
      )
    )
    return next
  }

  useEffect(() => socket.onStatus((status) => {
    setConnectionStatus(status)
    if (status === "disconnected") {
      clearChatCache()
    }
  }), [socket])

  useEffect(() => {
    return socket.subscribe<SidebarData>({ type: "sidebar" }, (snapshot) => {
      setSidebarData(snapshot)
      setProjectSelection((current) => transitionProjectSelection(current, {
        type: "sidebar.loaded",
        firstProjectId: snapshot.projectGroups[0]?.groupKey ?? null,
      }))
      useChatInputStore.getState().reconcileQueuedDrafts(
        snapshot.projectGroups.flatMap((group) => group.chats.map((chat) => chat.chatId))
      )
      // Mark cached chats as stale when sidebar shows newer lastMessageAt
      const allChats = snapshot.projectGroups.flatMap((group) => group.chats)
      markCachedChatsStale(allChats)
      setSidebarReady(true)
      setCommandError(null)
    })
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    return socket.subscribe<LocalProjectsSnapshot>({ type: "local-projects" }, (snapshot) => {
      setLocalProjects(snapshot)
      setLocalProjectsReady(true)
      setCommandError(null)
    })
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    return socket.subscribe<UpdateSnapshot>({ type: "update" }, (snapshot) => {
      setUpdateSnapshot(snapshot)
      setCommandError(null)
    })
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    if (connectionStatus !== "connected") return
    void socket.command<UpdateSnapshot>({ type: "update.check", force: true }).catch((error) => {
      setCommandError(error instanceof Error ? error.message : String(error))
    })
  }, [connectionStatus, socket])

  useEffect(() => {
    const phase = getUiUpdateRestartPhase()
    const reconnectAction = getUiUpdateRestartReconnectAction(phase, connectionStatus)
    if (reconnectAction === "awaiting_reconnect") {
      setUiUpdateRestartPhase("awaiting_reconnect")
      return
    }

    if (reconnectAction === "navigate_changelog") {
      clearUiUpdateRestartPhase()
      navigate("/settings/changelog", { replace: true })
    }
  }, [connectionStatus, navigate])

  useEffect(() => {
    function handleWindowFocus() {
      if (!updateSnapshot?.lastCheckedAt) return
      if (Date.now() - updateSnapshot.lastCheckedAt <= 60 * 60 * 1000) return
      void socket.command<UpdateSnapshot>({ type: "update.check" }).catch((error) => {
        setCommandError(error instanceof Error ? error.message : String(error))
      })
    }

    window.addEventListener("focus", handleWindowFocus)
    return () => {
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [socket, updateSnapshot?.lastCheckedAt])

  useEffect(() => {
    function maybeRefreshAfterResume(trigger: "focus" | "online" | "pageshow" | "visibilitychange") {
      const resumedAt = Date.now()
      if (!shouldRefreshStaleSessionOnResume({
        isStandalone: isStandalonePwaDisplay(),
        hiddenAt: backgroundedAtRef.current,
        resumedAt,
        connectionStatus,
      })) return

      if (resumedAt - lastResumeRefreshAtRef.current < RESUME_REFRESH_DEDUP_WINDOW_MS) return
      lastResumeRefreshAtRef.current = resumedAt
      backgroundedAtRef.current = null

      logTinkariaState("refreshing stale session after app resume", {
        trigger,
        activeChatId,
        connectionStatus,
      })
      void socket.ensureHealthyConnection()
      setResumeRefreshNonce((current) => current + 1)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        backgroundedAtRef.current = Date.now()
        return
      }

      if (document.visibilityState === "visible") {
        maybeRefreshAfterResume("visibilitychange")
      }
    }

    function handleWindowFocus() {
      maybeRefreshAfterResume("focus")
    }

    function handleWindowOnline() {
      maybeRefreshAfterResume("online")
    }

    function handlePageShow() {
      maybeRefreshAfterResume("pageshow")
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("online", handleWindowOnline)
    window.addEventListener("pageshow", handlePageShow)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("online", handleWindowOnline)
      window.removeEventListener("pageshow", handlePageShow)
    }
  }, [activeChatId, connectionStatus, socket])

  useEffect(() => {
    if (resumeRefreshNonce === 0) return

    for (const projectId of getResumeRefreshSessionProjectIds(activeSessionsSubs.current.keys())) {
      void socket.command({ type: "sessions.refresh", projectId }).catch((error) => {
        setCommandError(error instanceof Error ? error.message : String(error))
      })
    }
  }, [resumeRefreshNonce, socket])

  useEffect(() => {
    if (!activeChatId) {
      logTinkariaState("clearing chat snapshot for non-chat route")
      setChatSnapshot(null)
      setProjectSelection((current) => transitionProjectSelection(current, { type: "chat.cleared" }))
      // Don't mutate cached hydrator — create a fresh one
      hydratorRef.current = createIncrementalHydrator()
      setMessages([])
      setChatReady(true)
      return
    }

    // Restore from cache or create fresh state
    const cached = getCachedChat(activeChatId)
    const restoredFromCache = cached !== null
    const hydrator = cached?.hydrator ?? createIncrementalHydrator()
    hydratorRef.current = hydrator

    if (restoredFromCache) {
      logTinkariaState("restoring chat from cache", {
        activeChatId,
        cachedMessages: cached.messages.length,
        cachedDiagnostics: summarizeTranscriptWindow(cached.messages),
        stale: cached.stale,
      })
      setMessages(cached.messages)
      setChatSnapshot(null) // will be replaced when snapshot arrives
      setChatReady(true)    // show stale content immediately
    } else {
      logTinkariaState("subscribing to chat (no cache)", { activeChatId })
      setChatSnapshot(null)
      setMessages([])
      setChatReady(false)
    }

    // Buffer message events that arrive before the initial fetch completes
    let cancelled = false
    let initialFetchDone = false
    let fetchTriggered = false
    const buffer: TranscriptEntry[] = []
    const chatId = activeChatId

    function flushTail(entries: TranscriptEntry[], source: "fetched" | "fallback_empty") {
      if (cancelled) return
      initialFetchDone = true
      const bufferedEntries = buffer.length
      const allEntries = bufferedEntries > 0 ? [...entries, ...buffer] : entries
      buffer.length = 0
      // Only reset on fresh load — cache-restored hydrators skip duplicates via seenEntryIds
      if (!restoredFromCache) {
        hydrator.reset()
      }
      for (const entry of allEntries) hydrator.hydrate(entry)
      const hydratedMessages = hydrator.getMessages()
      setMessages(hydratedMessages)
      logTinkariaState("transcript tail flushed", {
        chatId,
        source,
        restoredFromCache,
        fetchedEntryCount: entries.length,
        bufferedEntryCount: bufferedEntries,
        hydratedDiagnostics: summarizeTranscriptWindow(hydratedMessages),
      })
    }

    async function fetchTail(messageCount: number) {
      if (fetchTriggered) return
      fetchTriggered = true
      try {
        let offset = computeTailOffset(messageCount)
        let entries = await socket.command<TranscriptEntry[]>({
          type: "chat.getMessages", chatId, offset, limit: TRANSCRIPT_TAIL_SIZE,
        })
        let hydratedPreview = processTranscriptMessages(entries)

        logTinkariaState("transcript tail fetched", {
          chatId,
          messageCount,
          offset,
          rawEntryCount: entries.length,
          hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
        })

        while (shouldBackfillTranscriptWindow({
          messages: hydratedPreview,
          messageCount,
          offset,
        })) {
          const nextOffset = Math.max(0, offset - TRANSCRIPT_TAIL_SIZE)
          logTinkariaState("transcript tail needs backfill", {
            chatId,
            messageCount,
            offset,
            hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
          })
          const olderEntries = await socket.command<TranscriptEntry[]>({
            type: "chat.getMessages",
            chatId,
            offset: nextOffset,
            limit: offset - nextOffset,
          })
          if (olderEntries.length === 0) break
          entries = [...olderEntries, ...entries]
          offset = nextOffset
          hydratedPreview = processTranscriptMessages(entries)
          logTinkariaState("backfilling transcript window", {
            chatId,
            messageCount,
            offset,
            fetchedEntries: entries.length,
            hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
          })
        }

        flushTail(entries, "fetched")
      } catch (error) {
        logTinkariaState("transcript tail fetch failed", {
          chatId,
          error: error instanceof Error ? error.message : String(error),
        })
        flushTail([], "fallback_empty")
      }
    }

    const unsub = socket.subscribe<ChatSnapshot | null, ChatMessageEvent>(
      { type: "chat", chatId: activeChatId },
      (snapshot) => {
        if (cancelled) return
        logTinkariaState("chat snapshot received", {
          activeChatId,
          snapshotChatId: snapshot?.runtime.chatId ?? null,
          snapshotProvider: snapshot?.runtime.provider ?? null,
          snapshotStatus: snapshot?.runtime.status ?? null,
        })
        setChatSnapshot(snapshot)
        if (snapshot) {
          messageCountRef.current = snapshot.messageCount
          setProjectSelection((current) => transitionProjectSelection(current, {
            type: "chat.snapshot_received",
            projectId: snapshot.runtime.projectId,
          }))
          if (isProcessingStatus(snapshot.runtime.status)) {
            updateSubmitPipeline((current) => markPostFlushBusyObserved(current, snapshot.runtime.chatId))
          } else {
            maybeFlushQueuedSubmit(snapshot.runtime.chatId, false)
          }
        }
        setChatReady(true)
        setCommandError(null)

        // Fetch tail on first snapshot — messageCount tells us where the end is
        if (snapshot && !initialFetchDone) {
          void fetchTail(snapshot.messageCount)
        }
      },
      (event) => {
        if (cancelled) return
        if (event.chatId !== activeChatId) return
        if (initialFetchDone) {
          hydrator.hydrate(event.entry)
          setMessages(hydrator.getMessages())
        } else {
          buffer.push(event.entry)
        }
      }
    )

    return () => {
      cancelled = true
      unsub()
      // Save departing chat to cache — use sidebar's lastMessageAt as the source of truth
      const departingSidebarChat = sidebarData.projectGroups
        .flatMap((g) => g.chats)
        .find((c) => c.chatId === chatId)
      if (chatId && messagesRef.current.length > 0) {
        setCachedChat(chatId, {
          hydrator,
          messages: messagesRef.current,
          messageCount: messageCountRef.current,
          cachedAt: Date.now(),
          lastMessageAt: departingSidebarChat?.lastMessageAt,
          stale: false,
        })
      }
    }
  }, [activeChatId, resumeRefreshNonce, socket])

  useEffect(() => {
    if (!activeChatId) return
    if (!sidebarReady || !chatReady) return
    const exists = sidebarData.projectGroups.some((group) => group.chats.some((chat) => chat.chatId === activeChatId))
    if (exists) {
      if (pendingChatId === activeChatId) {
        setPendingChatId(null)
      }
      return
    }
    if (pendingChatId === activeChatId) {
      return
    }
    navigate("/")
  }, [activeChatId, chatReady, navigate, pendingChatId, sidebarData.projectGroups, sidebarReady])

  useEffect(() => {
    if (!chatSnapshot) return
    if (pendingChatId === chatSnapshot.runtime.chatId) {
      setPendingChatId(null)
    }
  }, [chatSnapshot, pendingChatId])

  useEffect(() => {
    return () => {
      if (initialScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(initialScrollFrameRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => { messagesRef.current = messages }, [messages])

  useLayoutEffect(() => {
    const element = inputRef.current
    if (!element) return

    const observer = new ResizeObserver(() => {
      setInputHeight(element.getBoundingClientRect().height)
    })
    observer.observe(element)
    setInputHeight(element.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [])

  const activeChatSnapshot = useMemo(
    () => getActiveChatSnapshot(chatSnapshot, activeChatId),
    [activeChatId, chatSnapshot]
  )
  const activeSidebarChat = useMemo(
    () => getSidebarChatRow(sidebarData.projectGroups, activeChatId),
    [activeChatId, sidebarData.projectGroups]
  )
  useEffect(() => {
    logTinkariaState("active snapshot resolved", {
      routeChatId: activeChatId,
      rawSnapshotChatId: chatSnapshot?.runtime.chatId ?? null,
      rawSnapshotProvider: chatSnapshot?.runtime.provider ?? null,
      activeSnapshotChatId: activeChatSnapshot?.runtime.chatId ?? null,
      activeSnapshotProvider: activeChatSnapshot?.runtime.provider ?? null,
      pendingChatId,
    })
  }, [activeChatId, activeChatSnapshot, chatSnapshot, pendingChatId])
  const latestToolIds = useMemo(() => getLatestToolIds(messages), [messages])
  const latestReadableMessage = useMemo(() => getLastReadableMessage(messages), [messages])
  const runtime = activeChatSnapshot?.runtime ?? null
  const currentAccountInfo = useMemo(() => {
    const firstAccountInfo = messages.find((message) => message.kind === "account_info")
    return firstAccountInfo?.accountInfo ?? null
  }, [messages])
  const availableProviders = activeChatSnapshot?.availableProviders ?? PROVIDERS
  const isProcessing = isProcessingStatus(runtime?.status)
  const canCancel = canCancelStatus(runtime?.status)
  const hasResolvedActiveSidebarChat = !activeChatId || activeSidebarChat !== null
  const nextInitialChatReadAnchor = getInitialChatReadAnchor({
    activeChatId,
    sidebarReady,
    hasSidebarChat: hasResolvedActiveSidebarChat,
    messages,
    lastReadMessageId,
    lastReadBlockIndex,
    lastSeenMessageAt,
    lastMessageAt: activeSidebarChat?.lastMessageAt,
  })
  const [initialChatReadAnchor, setInitialChatReadAnchor] = useState<InitialChatReadAnchor>({ kind: "wait" })

  useEffect(() => {
    initialScrollCompletedRef.current = false
    if (initialScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(initialScrollFrameRef.current)
      initialScrollFrameRef.current = null
    }
    setInitialChatReadAnchor({ kind: "wait" })
  }, [activeChatId])

  useEffect(() => () => {
    if (initialScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(initialScrollFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (initialScrollCompletedRef.current) return

    setInitialChatReadAnchor((current) => {
      const lockedAnchor = getLockedInitialChatReadAnchor(current, nextInitialChatReadAnchor, initialScrollCompletedRef.current)
      if (lockedAnchor.kind !== "wait" && current.kind === "wait") {
        setIsAtBottom(lockedAnchor.kind === "tail")
      }
      return lockedAnchor
    })
  }, [nextInitialChatReadAnchor])

  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = !isAtBottom && messages.length > 0
  const fallbackLocalProjectPath = localProjects?.projects[0]?.localPath ?? null
  const selectedProject = resolveProjectSelection(projectSelection)
  const selectedProjectId = selectedProject.projectId
  const navbarLocalPath =
    runtime?.localPath
    ?? fallbackLocalProjectPath
    ?? sidebarData.projectGroups[0]?.localPath
  const hasSelectedProject = Boolean(
    selectedProjectId
    ?? runtime?.projectId
    ?? sidebarData.projectGroups[0]?.groupKey
    ?? fallbackLocalProjectPath
  )
  const chatHasKnownMessages = activeSidebarChat?.lastMessageAt !== undefined
  const initialReadAnchorMessageId = initialChatReadAnchor.kind === "block" ? initialChatReadAnchor.messageId : null
  const initialReadAnchorBlockIndex = initialChatReadAnchor.kind === "block" ? initialChatReadAnchor.blockIndex : null

  useLayoutEffect(() => {
    if (initialScrollCompletedRef.current) return

    const element = scrollRef.current
    if (!element) return
    if (initialChatReadAnchor.kind !== "tail") return

    element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    if (initialScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(initialScrollFrameRef.current)
    }
    initialScrollFrameRef.current = window.requestAnimationFrame(() => {
      const currentElement = scrollRef.current
      if (!currentElement) return
      currentElement.scrollTo({ top: currentElement.scrollHeight, behavior: "auto" })
      initialScrollFrameRef.current = null
    })
    initialScrollCompletedRef.current = true
  }, [activeChatId, initialChatReadAnchor, inputHeight, messages.length])

  useEffect(() => {
    if (!initialScrollCompletedRef.current || !isAtBottom) return

    const frameId = window.requestAnimationFrame(() => {
      const element = scrollRef.current
      if (!element || !isAtBottom) return
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeChatId, inputHeight, isAtBottom, messages.length, runtime?.status])

  useEffect(() => {
    const provider = activeChatSnapshot?.runtime.provider
    const sessionToken = activeChatSnapshot?.runtime.sessionToken
    if (!activeChatId || !provider || !sessionToken) {
      setCurrentSessionRuntime(null)
      return
    }

    const chatId = activeChatId
    let cancelled = false

    async function refreshCurrentSessionRuntime() {
      try {
        const result = await socket.command<CurrentSessionSnapshot>({
          type: "chat.getSessionRuntime",
          chatId,
        })
        if (!cancelled) {
          setCurrentSessionRuntime(result.runtime)
        }
      } catch {
        if (!cancelled) {
          setCurrentSessionRuntime(null)
        }
      }
    }

    void refreshCurrentSessionRuntime()

    if (!isProcessing) {
      return () => {
        cancelled = true
      }
    }

    const interval = window.setInterval(() => {
      void refreshCurrentSessionRuntime()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeChatId, activeChatSnapshot?.runtime.provider, activeChatSnapshot?.runtime.sessionToken, isProcessing, resumeRefreshNonce, socket])

  useEffect(() => {
    if (!activeChatId) {
      setCurrentRepoStatus(null)
      return
    }

    const chatId = activeChatId
    let cancelled = false

    async function refreshCurrentRepoStatus() {
      try {
        const result = await socket.command<{ repoStatus: CurrentRepoStatusSnapshot | null }>({
          type: "chat.getRepoStatus",
          chatId,
        })
        if (!cancelled) {
          setCurrentRepoStatus(result.repoStatus)
        }
      } catch {
        if (!cancelled) {
          setCurrentRepoStatus(null)
        }
      }
    }

    void refreshCurrentRepoStatus()

    if (!isProcessing) {
      return () => {
        cancelled = true
      }
    }

    const interval = window.setInterval(() => {
      void refreshCurrentRepoStatus()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeChatId, isProcessing, resumeRefreshNonce, socket])

  useEffect(() => {
    if (!activeChatId) return
    const lastMessageAt = activeSidebarChat?.lastMessageAt
    if (!initialScrollCompletedRef.current || !isAtBottom || lastMessageAt === undefined) return
    markChatRead(activeChatId, {
      messageId: latestReadableMessage?.id,
      blockIndex: latestReadableMessage ? Math.max(0, getReadableBlockCount(latestReadableMessage) - 1) : undefined,
      lastMessageAt,
    })
  }, [activeChatId, activeSidebarChat?.lastMessageAt, isAtBottom, latestReadableMessage, markChatRead])

  function updateScrollState() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    const nextIsAtBottom = shouldAutoFollowTranscript(distance)
    setIsAtBottom((current) => current === nextIsAtBottom ? current : nextIsAtBottom)
  }

  function enableAutoFollow(behavior: ScrollBehavior) {
    const element = scrollRef.current
    setIsAtBottom(true)
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }

  function scrollToBottom() {
    enableAutoFollow("smooth")
  }

  function handleInitialReadAnchorScrolled() {
    initialScrollCompletedRef.current = true
  }

  function keepComposerSubmitAnchored() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (!shouldStickToBottomOnComposerSubmit(distance)) return
    enableAutoFollow("auto")
  }

  function maybeFlushQueuedSubmit(chatId: string, isProcessing: boolean) {
    const { state: nextState, flushRequest } = startQueuedFlush(submitPipelineRef.current, {
      chatId,
      isProcessing,
    })
    if (!flushRequest) return

    submitPipelineRef.current = nextState
    setSubmitPipeline(nextState)

    void handleSend(flushRequest.text, flushRequest.options)
      .then(() => {
        updateSubmitPipeline((current) => completeQueuedFlush(current, chatId))
      })
      .catch(() => {
        updateSubmitPipeline((current) => failQueuedFlush(current, {
          chatId,
          flushedText: flushRequest.text,
        }))
      })
  }

  async function createChatForProject(projectId: string) {
    useChatPreferencesStore.getState().initializeComposerForNewChat()
    const result = await socket.command<{ chatId: string }>({ type: "chat.create", projectId })
    setProjectSelection((current) => transitionProjectSelection(current, {
      type: "project.explicitly_selected",
      projectId,
    }))
    setPendingChatId(result.chatId)
    navigate(`/chat/${result.chatId}`)
    setSidebarOpen(false)
    setCommandError(null)
  }

  async function resolveProjectIdForStartChat(intent: StartChatIntent): Promise<{ projectId: string; localPath?: string }> {
    if (intent.kind === "project_id") {
      return { projectId: intent.projectId }
    }

    if (intent.kind === "local_path") {
      const result = await socket.command<{ projectId: string }>({ type: "project.open", localPath: intent.localPath })
      return { projectId: result.projectId, localPath: intent.localPath }
    }

    const result = await socket.command<{ projectId: string }>(
      intent.project.mode === "new"
        ? { type: "project.create", localPath: intent.project.localPath, title: intent.project.title }
        : { type: "project.open", localPath: intent.project.localPath }
    )
    return { projectId: result.projectId, localPath: intent.project.localPath }
  }

  async function startChatFromIntent(intent: StartChatIntent) {
    try {
      const localPath = intent.kind === "project_id"
        ? null
        : intent.kind === "local_path"
          ? intent.localPath
          : intent.project.localPath
      if (localPath) {
        setStartingLocalPath(localPath)
      }

      const { projectId } = await resolveProjectIdForStartChat(intent)
      await createChatForProject(projectId)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    } finally {
      setStartingLocalPath(null)
    }
  }

  async function handleCreateChat(projectId: string) {
    await startChatFromIntent({ kind: "project_id", projectId })
  }

  async function handleOpenLocalProject(localPath: string) {
    await startChatFromIntent({ kind: "local_path", localPath })
  }

  async function handleCreateProject(project: ProjectRequest) {
    await startChatFromIntent({ kind: "project_request", project })
  }

  async function handleCheckForUpdates(options?: { force?: boolean }) {
    try {
      await socket.command<UpdateSnapshot>({ type: "update.check", force: options?.force })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleInstallUpdate() {
    try {
      const result = await socket.command<UpdateInstallResult>({ type: "update.install" })
      if (!result.ok) {
        clearUiUpdateRestartPhase()
        setCommandError(null)
        await dialog.alert({
          title: result.userTitle ?? "Update failed",
          description: result.userMessage ?? `${APP_NAME} could not install the update. Try again later.`,
          closeLabel: "OK",
        })
        return
      }

      if (result.ok && result.action === "reload") {
        window.location.reload()
        return
      }

      if (result.ok && result.action === "restart") {
        setUiUpdateRestartPhase("awaiting_disconnect")
      }
      setCommandError(null)
    } catch (error) {
      clearUiUpdateRestartPhase()
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSend(
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) {
    try {
      let projectId = selectedProjectId ?? sidebarData.projectGroups[0]?.groupKey ?? null
      if (!activeChatId && !projectId && fallbackLocalProjectPath) {
        const project = await socket.command<{ projectId: string }>({
          type: "project.open",
          localPath: fallbackLocalProjectPath,
        })
        projectId = project.projectId
        setProjectSelection((current) => transitionProjectSelection(current, {
          type: "project.explicitly_selected",
          projectId,
        }))
      }

      if (!activeChatId && !projectId) {
        throw new Error("Open a project first")
      }

      enableAutoFollow("auto")

      const result = await socket.command<{ chatId?: string }>({
        type: "chat.send",
        chatId: activeChatId ?? undefined,
        projectId: activeChatId ? undefined : projectId ?? undefined,
        provider: options?.provider,
        content,
        model: options?.model,
        modelOptions: options?.modelOptions,
        planMode: options?.planMode,
      })

      if (!activeChatId && result.chatId) {
        setPendingChatId(result.chatId)
        navigate(`/chat/${result.chatId}`)
      }

      const readTimestampToPersist = getReadTimestampToPersistAfterReply(lastSeenMessageAt, activeSidebarChat?.lastMessageAt)
      if (activeChatId && readTimestampToPersist !== null) {
        markChatRead(activeChatId, {
          messageId: latestReadableMessage?.id,
          blockIndex: latestReadableMessage ? Math.max(0, getReadableBlockCount(latestReadableMessage) - 1) : undefined,
          lastMessageAt: readTimestampToPersist,
        })
      }

      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function handleSubmitFromComposer(
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) {
    keepComposerSubmitAnchored()

    if (!activeChatId) {
      await handleSend(content, options)
      return "sent"
    }

    if (
      shouldQueueChatSubmit(isProcessing, activeQueuedText)
      || getSubmitPipelineMode(submitPipeline, activeChatId) === "flushing"
      || getSubmitPipelineMode(submitPipeline, activeChatId) === "awaiting_busy_ack"
    ) {
      updateSubmitPipeline((current) => queueSubmitTransition(current, {
        chatId: activeChatId,
        content,
        options: options ?? undefined,
      }))
      if (!isProcessing) {
        maybeFlushQueuedSubmit(activeChatId, false)
      }
      return "queued"
    }

    await handleSend(content, options)
    return "sent"
  }

  function clearQueuedText() {
    if (!activeChatId) return
    updateSubmitPipeline((current) => clearQueuedSubmit(current, activeChatId))
  }

  function restoreQueuedText(): string {
    const restored = activeQueuedText
    if (!activeChatId) return restored
    updateSubmitPipeline((current) => clearQueuedSubmit(current, activeChatId))
    return restored
  }

  async function handleCancel() {
    if (!activeChatId) return
    try {
      await socket.command({ type: "chat.cancel", chatId: activeChatId })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteChat(chat: SidebarChatRow) {
    const confirmed = await dialog.confirm({
      title: "Delete Chat",
      description: `Delete "${chat.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    try {
      await socket.command({ type: "chat.delete", chatId: chat.chatId })
      useChatInputStore.getState().clearQueuedDraft(chat.chatId)
      clearChatReadState(chat.chatId)
      deleteCachedChat(chat.chatId)
      if (chat.chatId === activeChatId) {
        const nextChatId = getNewestRemainingChatId(sidebarData.projectGroups, chat.chatId)
        navigate(nextChatId ? `/chat/${nextChatId}` : "/")
      }
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRenameChat(chatId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await socket.command({ type: "chat.rename", chatId, title: trimmed })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleRemoveProject(projectId: string) {
    const project = sidebarData.projectGroups.find((group) => group.groupKey === projectId)
    if (!project) return
    const projectName = project.localPath.split("/").filter(Boolean).pop() ?? project.localPath
    const confirmed = await dialog.confirm({
      title: "Remove",
      description: `Remove "${projectName}" from the sidebar? Existing chats will be removed from ${APP_NAME}.`,
      confirmLabel: "Remove",
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    try {
      await socket.command({ type: "project.remove", projectId })
      for (const chat of project.chats) {
        useChatInputStore.getState().clearQueuedDraft(chat.chatId)
        deleteCachedChat(chat.chatId)
      }
      useTerminalLayoutStore.getState().clearProject(projectId)
      useRightSidebarStore.getState().clearProject(projectId)
      if (runtime?.projectId === projectId) {
        navigate("/")
      }
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenExternal(action: "open_finder") {
    const localPath = runtime?.localPath ?? localProjects?.projects[0]?.localPath ?? sidebarData.projectGroups[0]?.localPath
    if (!localPath) return
    try {
      await openExternal({
        action,
        localPath,
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenLocalLink(target: { path: string; line?: number; column?: number }) {
    try {
      const result = await socket.command<{ localPath: string; content: string }>({
        type: "system.readLocalFilePreview",
        localPath: target.path,
      })
      setLocalFilePreview({
        path: result.localPath,
        content: result.content,
        line: target.line,
        column: target.column,
      })
      setCommandError(null)
    } catch (error) {
      setCommandError(normalizeLocalFilePreviewErrorMessage(error))
    }
  }

  async function handleOpenExternalPath(action: "open_finder", localPath: string) {
    try {
      await openExternal({
        action,
        localPath,
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  function handleOpenExternalLink(href: string): boolean {
    void href
    return false
  }

  async function openExternal(command: {
    action: "open_finder"
    localPath: string
  }) {
    setCommandError(null)
    await socket.command({
      type: "system.openExternal",
      ...command,
    })
  }

  const handleOpenSessionPicker = useCallback(
    (projectId: string, open: boolean) => {
      if (open) {
        if (activeSessionsSubs.current.has(projectId)) return
        const unsub = socket.subscribe<SessionsSnapshot>(
          { type: "sessions", projectId },
          (snapshot) => {
            setSessionsSnapshots((prev) => new Map(prev).set(projectId, snapshot))
          }
        )
        activeSessionsSubs.current.set(projectId, unsub)
      } else {
        const unsub = activeSessionsSubs.current.get(projectId)
        unsub?.()
        activeSessionsSubs.current.delete(projectId)
      }
    },
    [socket]
  )

  const handleResumeSession = useCallback(
    async (projectId: string, sessionId: string, provider: AgentProvider) => {
      try {
        const result = await socket.command<{ chatId: string }>({
          type: "sessions.resume",
          projectId,
          sessionId,
          provider,
        })
        if (result?.chatId) {
          setPendingChatId(result.chatId)
          navigate(`/chat/${result.chatId}`)
        }
        setCommandError(null)
      } catch (error) {
        setCommandError(error instanceof Error ? error.message : String(error))
      }
    },
    [navigate, socket]
  )

  const handleRefreshSessions = useCallback(
    (projectId: string) => {
      void socket.command({ type: "sessions.refresh", projectId }).catch((error) => {
        setCommandError(error instanceof Error ? error.message : String(error))
      })
    },
    [socket]
  )

  const handleShowMoreSessions = useCallback(
    (projectId: string) => {
      setSessionsWindowDays((prev) => {
        const current = prev.get(projectId) ?? 7
        return new Map(prev).set(projectId, current + 7)
      })
    },
    []
  )

  function handleCompose() {
    const intent = resolveComposeIntent({
      selectedProjectId,
      sidebarProjectId: sidebarData.projectGroups[0]?.groupKey,
      fallbackLocalProjectPath,
    })
    if (intent) {
      void startChatFromIntent(intent)
      return
    }

    navigate("/")
  }

  async function handleAskUserQuestion(
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) {
    if (!activeChatId) return
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId: activeChatId,
        toolUseId,
        result: { questions, answers },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleExitPlanMode(toolUseId: string, confirmed: boolean, clearContext?: boolean, message?: string) {
    if (!activeChatId) return
    if (confirmed) {
      useChatPreferencesStore.getState().setComposerPlanMode(false)
    }
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId: activeChatId,
        toolUseId,
        result: {
          confirmed,
          ...(clearContext ? { clearContext: true } : {}),
          ...(message ? { message } : {}),
        },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    socket,
    activeChatId,
    sidebarData,
    localProjects,
    updateSnapshot,
    chatSnapshot,
    connectionStatus,
    sidebarReady,
    localProjectsReady,
    commandError,
    startingLocalPath,
    sidebarOpen,
    sidebarCollapsed,
    scrollRef,
    inputRef,
    messages,
    latestToolIds,
    runtime,
    currentSessionRuntime,
    currentRepoStatus,
    currentAccountInfo,
    availableProviders,
    isProcessing,
    canCancel,
    queuedText: activeQueuedText,
    transcriptPaddingBottom,
    showScrollButton,
    initialReadAnchorMessageId,
    initialReadAnchorBlockIndex,
    navbarLocalPath,
    hasSelectedProject,
    chatHasKnownMessages,
    localFilePreview,
    openSidebar: () => {
      setSidebarOpen(true)
      if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
        (document.activeElement as HTMLElement)?.blur?.()
      }
    },
    closeSidebar: () => setSidebarOpen(false),
    collapseSidebar: () => setSidebarCollapsed(true),
    expandSidebar: () => setSidebarCollapsed(false),
    closeLocalFilePreview: () => setLocalFilePreview(null),
    handleInitialReadAnchorScrolled,
    updateScrollState,
    scrollToBottom,
    handleCreateChat,
    handleOpenLocalProject,
    handleCreateProject,
    handleCheckForUpdates,
    handleInstallUpdate,
    handleSend,
    handleSubmitFromComposer,
    handleCancel,
    clearQueuedText,
    restoreQueuedText,
    handleDeleteChat,
    handleRenameChat,
    handleRemoveProject,
    handleOpenExternal,
    handleOpenExternalPath,
    handleOpenLocalLink,
    handleOpenExternalLink,
    sessionsSnapshots,
    sessionsWindowDays,
    handleOpenSessionPicker,
    handleResumeSession,
    handleRefreshSessions,
    handleShowMoreSessions,
    handleCompose,
    handleAskUserQuestion,
    handleExitPlanMode,
  }
}
