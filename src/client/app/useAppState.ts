import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useScrollFollow } from "./useScrollFollow"
import { shouldShowScrollButton } from "./scrollMachine"
import { useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import {
  PROVIDERS,
  type AgentProvider,
  type AskUserQuestionAnswerMap,
  type CurrentRepoStatusSnapshot,
  type CurrentSessionSnapshot,
  type ModelOptions,
  type OrchestrationHierarchySnapshot,
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
import { useSessionPolling } from "./useSessionPolling"
import { createIncrementalHydrator, processTranscriptMessages } from "../lib/parseTranscript"
import type { IncrementalHydrator } from "../lib/parseTranscript"
import { getCachedChat, setCachedChat, deleteCachedChat, clearChatCache, markCachedChatsStale } from "./chatCache"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
import {
  completeQueuedFlush,
  createProjectSelectionState,
  failQueuedFlush,
  getSubmitPipelineMode,
  markPostFlushBusyObserved,
  resolveProjectSelection,
  startQueuedFlush,
  transitionProjectSelection,
  queueSubmit as queueSubmitTransition,
} from "./useAppState.machine"
import { useSubmitPipeline } from "./useSubmitPipeline"
import { NatsSocket } from "./nats-socket"
import type { AppTransport, SocketStatus } from "./socket-interface"
import {
  compareReadBoundary,
  computeTailOffset,
  getActiveChatSnapshot,
  getHookReadProgressBoundary,
  getInitialChatReadAnchor,
  getLastReadableMessage,
  getNewestRemainingChatId,
  getReadableBlockCount,
  getReadTimestampToPersistAfterReply,
  getSidebarChatLabels,
  getSidebarChatRow,
  getUiUpdateRestartReconnectAction,
  normalizeCommandErrorMessage,
  normalizeLocalFilePreviewErrorMessage,
  resolveComposeIntent,
  resolveLockedAnchor,
  shouldBackfillTranscriptWindow,
  shouldQueueChatSubmit,
  shouldStickToBottomOnComposerSubmit,
  summarizeTranscriptWindow,
  TRANSCRIPT_TAIL_SIZE,
  type InitialChatReadAnchor,
  type LockedAnchorState,
  type PendingSessionBootstrap,
  type ProjectRequest,
  type StartChatIntent,
} from "./appState.helpers"
import { usePwaResume } from "./usePwaResume"

// Re-export all moved helpers so existing consumers continue to work
export {
  appendQueuedText,
  compareReadBoundary,
  computeTailOffset,
  getActiveChatSnapshot,
  getHookReadProgressBoundary,
  getInitialChatReadAnchor,
  getLastReadableMessage,
  getLockedInitialChatReadAnchor,
  getNewestRemainingChatId,
  getNextReadableBoundary,
  getReadableBlockCount,
  getReadTimestampToPersistAfterReply,
  getResumeRefreshSessionProjectIds,
  getSidebarChatLabels,
  getSidebarChatRow,
  getUiUpdateRestartReconnectAction,
  getViewportRatioThresholdPx,
  hasRenderableTranscriptHistory,
  isChatRead,
  isReadableTranscriptMessage,
  normalizeCommandErrorMessage,
  normalizeLocalFilePreviewErrorMessage,
  prependQueuedText,
  resolveComposeIntent,
  resolveLockedAnchor,
  shouldBackfillTranscriptWindow,
  shouldFlushQueuedText,
  shouldQueueChatSubmit,
  shouldRefreshStaleSessionOnResume,
  shouldStickToBottomOnComposerSubmit,
  summarizeTranscriptWindow,
  TRANSCRIPT_TAIL_SIZE,
  PWA_RESUME_STALE_AFTER_MS,
} from "./appState.helpers"

export type {
  BoundaryComparison,
  InitialChatReadAnchor,
  LockedAnchorState,
  PendingSessionBootstrap,
  ProjectRequest,
  ReadBlockBoundary,
  ReadHookProgressBoundary,
  ReadHookProgressState,
  StartChatIntent,
  TranscriptWindowDiagnostics,
} from "./appState.helpers"

function useLockedAnchor(
  chatId: string | null,
  nextAnchor: InitialChatReadAnchor,
  scrollCompletedRef: RefObject<boolean>,
): InitialChatReadAnchor {
  const stateRef = useRef<LockedAnchorState>({ chatId: null, anchor: { kind: "wait" } })

  return useMemo(() => {
    stateRef.current = resolveLockedAnchor(
      stateRef.current,
      chatId,
      nextAnchor,
      scrollCompletedRef.current,
    )
    return stateRef.current.anchor
  }, [chatId, nextAnchor, scrollCompletedRef])
}

function useAppSocket(): AppTransport {
  const socketRef = useRef<AppTransport | null>(null)
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

  return socketRef.current as AppTransport
}

function logAppState(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[useAppState] ${message}`)
    return
  }

  console.info(`[useAppState] ${message}`, details)
}

// Chat cache module re-exports (extracted to ./chatCache.ts)
export { type CachedChatState, MAX_CACHED_CHATS } from "./chatCache"

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

export interface AppState {
  socket: AppTransport
  activeChatId: string | null
  sidebarData: SidebarData
  localProjects: LocalProjectsSnapshot | null
  updateSnapshot: UpdateSnapshot | null
  chatSnapshot: ChatSnapshot | null
  orchestrationHierarchy: OrchestrationHierarchySnapshot | null
  connectionStatus: SocketStatus
  sidebarReady: boolean
  localProjectsReady: boolean
  commandError: string | null
  startingLocalPath: string | null
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  sentinelRef: RefObject<HTMLDivElement | null>
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
  handleForkSession: (intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
  handleMergeSession: (chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string, closeSources?: boolean) => Promise<void>
  pendingSessionBootstrap: PendingSessionBootstrap | null
  pendingMergeProjectId: string | null
  requestMerge: (projectId: string) => void
  clearMergeRequest: () => void
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

export function useAppState(activeChatId: string | null): AppState {
  const navigate = useNavigate()
  const socket = useAppSocket()
  const dialog = useAppDialog()

  const [sidebarData, setSidebarData] = useState<SidebarData>({ projectGroups: [] })
  const [localProjects, setLocalProjects] = useState<LocalProjectsSnapshot | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [chatSnapshot, setChatSnapshot] = useState<ChatSnapshot | null>(null)
  const [orchestrationHierarchy, setOrchestrationHierarchy] = useState<OrchestrationHierarchySnapshot | null>(null)
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
  const [commandError, setCommandError] = useState<string | null>(null)
  const [startingLocalPath, setStartingLocalPath] = useState<string | null>(null)
  const [pendingChatId, setPendingChatId] = useState<string | null>(null)
  const [pendingMergeProjectId, setPendingMergeProjectId] = useState<string | null>(null)
  const [pendingSessionBootstrap, setPendingSessionBootstrap] = useState<PendingSessionBootstrap | null>(null)
  const {
    submitPipelineRef,
    submitPipeline,
    activeQueuedText,
    updateSubmitPipeline,
    clearQueuedText,
    restoreQueuedText,
  } = useSubmitPipeline({ activeChatId })
  const [localFilePreview, setLocalFilePreview] = useState<LocalFilePreview | null>(null)
  const [sessionsSnapshots, setSessionsSnapshots] = useState<Map<string, SessionsSnapshot>>(new Map())
  const [sessionsWindowDays, setSessionsWindowDays] = useState<Map<string, number>>(new Map())
  const activeSessionsSubs = useRef<Map<string, () => void>>(new Map())
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
  const sentinelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const initialScrollCompletedRef = useRef(false)
  const {
    isFollowing,
    modeRef: scrollModeRef,
    scrollToBottom: scrollFollowToBottom,
    handleInitialScrollDone,
    handleChatChanged: scrollFollowChatChanged,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  } = useScrollFollow(scrollRef, sentinelRef)
  const setNormalizedCommandError = useCallback((error: unknown) => {
    setCommandError(normalizeCommandErrorMessage(error))
  }, [])

  const { resumeRefreshNonce } = usePwaResume({
    socket,
    activeChatId,
    connectionStatus,
    openSessionProjectIds: activeSessionsSubs.current.keys(),
    setNormalizedCommandError,
  })

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
      setNormalizedCommandError(error)
    })
  }, [connectionStatus, setNormalizedCommandError, socket])

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
        setNormalizedCommandError(error)
      })
    }

    window.addEventListener("focus", handleWindowFocus)
    return () => {
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [setNormalizedCommandError, socket, updateSnapshot?.lastCheckedAt])

  useEffect(() => {
    if (!activeChatId) {
      logAppState("clearing chat snapshot for non-chat route")
      setChatSnapshot(null)
      setOrchestrationHierarchy(null)
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
      logAppState("restoring chat from cache", {
        activeChatId,
        cachedMessages: cached.messages.length,
        cachedDiagnostics: summarizeTranscriptWindow(cached.messages),
        stale: cached.stale,
      })
      setMessages(cached.messages)
      setChatSnapshot(null) // will be replaced when snapshot arrives
      setChatReady(true)    // show stale content immediately
    } else {
      logAppState("subscribing to chat (no cache)", { activeChatId })
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
      logAppState("transcript tail flushed", {
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

        logAppState("transcript tail fetched", {
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
          logAppState("transcript tail needs backfill", {
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
          logAppState("backfilling transcript window", {
            chatId,
            messageCount,
            offset,
            fetchedEntries: entries.length,
            hydratedDiagnostics: summarizeTranscriptWindow(hydratedPreview),
          })
        }

        flushTail(entries, "fetched")
      } catch (error) {
        logAppState("transcript tail fetch failed", {
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
        logAppState("chat snapshot received", {
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

    const orchestrationUnsub = socket.subscribe<OrchestrationHierarchySnapshot>(
      { type: "orchestration", chatId: activeChatId },
      (snapshot) => {
        if (cancelled) return
        setOrchestrationHierarchy(snapshot)
      },
    )

    return () => {
      cancelled = true
      unsub()
      orchestrationUnsub()
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
    logAppState("active snapshot resolved", {
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
  const initialChatReadAnchor = useLockedAnchor(activeChatId, nextInitialChatReadAnchor, initialScrollCompletedRef)

  useLayoutEffect(() => {
    initialScrollCompletedRef.current = false
    scrollFollowChatChanged()
  }, [activeChatId, scrollFollowChatChanged])

  // Tail-settle: keep scrolling to bottom while virtualizer measures and settles
  useEffect(() => {
    console.warn("[SETTLE]", { completed: initialScrollCompletedRef.current, anchor: initialChatReadAnchor.kind, msgLen: messages.length, hasEl: !!scrollRef.current })
    if (initialScrollCompletedRef.current) return
    if (initialChatReadAnchor.kind !== "tail") return
    if (messages.length === 0) return
    const element = scrollRef.current
    if (!element) return

    beginProgrammaticScroll()
    let lastScrollHeight = 0
    let stableCount = 0
    const capturedElement = element
    const interval = window.setInterval(() => {
      if (!capturedElement.isConnected) { window.clearInterval(interval); endProgrammaticScroll(); return }
      capturedElement.scrollTo({ top: capturedElement.scrollHeight, behavior: "auto" })
      if (capturedElement.scrollHeight === lastScrollHeight) {
        stableCount++
      } else {
        lastScrollHeight = capturedElement.scrollHeight
        stableCount = 0
      }
      if (stableCount >= 5 && capturedElement.scrollHeight > capturedElement.clientHeight) {
        window.clearInterval(interval)
        initialScrollCompletedRef.current = true
        handleInitialScrollDone("tail")
        endProgrammaticScroll()
      }
    }, 50)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      if (!initialScrollCompletedRef.current) {
        initialScrollCompletedRef.current = true
        handleInitialScrollDone("tail")
        endProgrammaticScroll()
      }
    }, 2000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      endProgrammaticScroll()
    }
  }, [activeChatId, beginProgrammaticScroll, endProgrammaticScroll, handleInitialScrollDone, initialChatReadAnchor.kind, messages.length])

  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = shouldShowScrollButton(scrollModeRef.current, messages.length)
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

  // External system sync: content ↔ scroll position
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    // Tail-follow: scroll to bottom on initial load and auto-follow
    const wantsTail = !initialScrollCompletedRef.current && initialChatReadAnchor.kind === "tail" && messages.length > 0
    const isAutoFollowing = initialScrollCompletedRef.current && scrollModeRef.current === "following"

    if (wantsTail || isAutoFollowing) {
      beginProgrammaticScroll()
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
      const frameId = window.requestAnimationFrame(() => endProgrammaticScroll())
      return () => {
        window.cancelAnimationFrame(frameId)
        endProgrammaticScroll()
      }
    }
  }, [activeChatId, beginProgrammaticScroll, endProgrammaticScroll, initialChatReadAnchor, inputHeight, messages.length, runtime?.status, handleInitialScrollDone, scrollModeRef])

  const syncReadBoundaryFromHooks = useCallback(() => {
    const element = scrollRef.current
    if (!element || !activeChatId) return
    const progress = getHookReadProgressBoundary(element)
    if (!progress || progress.state !== "read") return
    if (compareReadBoundary(
      messages,
      { messageId: lastReadMessageId, blockIndex: lastReadBlockIndex },
      { messageId: progress.messageId, blockIndex: progress.blockIndex },
    ) !== "advance") return
    markChatRead(activeChatId, {
      messageId: progress.messageId,
      blockIndex: progress.blockIndex,
    })
  }, [activeChatId, lastReadBlockIndex, lastReadMessageId, markChatRead, messages])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !activeChatId) return

    let frameId: number | null = null
    const scrollElement = element
    const resizeTarget = scrollElement.firstElementChild instanceof HTMLElement ? scrollElement.firstElementChild : scrollElement

    function scheduleHookSync() {
      if (!initialScrollCompletedRef.current) return
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncReadBoundaryFromHooks()
      })
    }

    function keepFollowPinnedOnResize() {
      if (!initialScrollCompletedRef.current || scrollModeRef.current !== "following") return
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: "auto" })
    }

    function handleScroll() {
      scheduleHookSync()
    }

    scrollElement.addEventListener("scroll", handleScroll, { passive: true })

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          keepFollowPinnedOnResize()
          scheduleHookSync()
        })
    resizeObserver?.observe(resizeTarget)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      scrollElement.removeEventListener("scroll", handleScroll)
      resizeObserver?.disconnect()
    }
  }, [activeChatId, scrollModeRef, syncReadBoundaryFromHooks])

  const { currentSessionRuntime, currentRepoStatus } = useSessionPolling({
    socket,
    activeChatId,
    sessionProvider: activeChatSnapshot?.runtime.provider,
    sessionToken: activeChatSnapshot?.runtime.sessionToken,
    isProcessing,
    resumeRefreshNonce,
  })

  useEffect(() => {
    if (!activeChatId) return
    const lastMessageAt = activeSidebarChat?.lastMessageAt
    if (!initialScrollCompletedRef.current || scrollModeRef.current !== "following" || lastMessageAt === undefined) return
    if (!latestReadableMessage) return
    const nextBlockIndex = Math.max(0, getReadableBlockCount(latestReadableMessage) - 1)
    if (compareReadBoundary(
      messages,
      { messageId: lastReadMessageId, blockIndex: lastReadBlockIndex },
      { messageId: latestReadableMessage.id, blockIndex: nextBlockIndex },
    ) !== "advance") {
      markChatRead(activeChatId, { lastMessageAt })
      return
    }
    markChatRead(activeChatId, {
      messageId: latestReadableMessage.id,
      blockIndex: nextBlockIndex,
      lastMessageAt,
    })
  }, [activeChatId, activeSidebarChat?.lastMessageAt, isFollowing, lastReadBlockIndex, lastReadMessageId, latestReadableMessage, markChatRead, messages])

  function scrollToBottom() {
    scrollFollowToBottom("smooth")
  }

  const handleInitialReadAnchorScrolled = useCallback(() => {
    initialScrollCompletedRef.current = true
    handleInitialScrollDone("block")
  }, [handleInitialScrollDone])

  function keepComposerSubmitAnchored() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (!shouldStickToBottomOnComposerSubmit(distance, element.clientHeight)) return
    scrollFollowToBottom("auto")
  }

  function maybeFlushQueuedSubmit(chatId: string, isProcessing: boolean) {
    const { state: nextState, flushRequest } = startQueuedFlush(submitPipelineRef.current, {
      chatId,
      isProcessing,
    })
    if (!flushRequest) return

    updateSubmitPipeline(() => nextState)

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

      scrollFollowToBottom("auto")

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

  async function handleForkSession(intent: string, provider: AgentProvider, model: string, preset?: string) {
    if (!activeChatId) {
      throw new Error("Open a chat first")
    }
    const projectId = chatSnapshot?.runtime?.projectId ?? selectedProjectId ?? sidebarData.projectGroups[0]?.groupKey ?? null
    if (!projectId) {
      throw new Error("Open a project first")
    }

    const { chatId } = await socket.command<{ chatId: string }>({ type: "chat.create", projectId })
    setPendingChatId(chatId)
    setPendingSessionBootstrap({
      chatId,
      kind: "fork",
      phase: "compacting",
      sourceLabels: [getSidebarChatRow(sidebarData.projectGroups, activeChatId)?.title?.trim() || activeChatId],
    })
    navigate(`/chat/${chatId}`)
    setSidebarOpen(false)
    setCommandError(null)

    void (async () => {
      try {
        const { prompt } = await socket.command<{ prompt: string }>({
          type: "chat.generateForkPrompt",
          chatId: activeChatId,
          intent,
          preset,
        })
        setPendingSessionBootstrap((current) => current?.chatId === chatId
          ? { ...current, phase: "starting" }
          : current)
        const defaults = useChatPreferencesStore.getState().providerDefaults[provider]
        const modelOptions: ModelOptions = provider === "claude"
          ? { claude: { ...defaults.modelOptions as import("../../shared/types").ClaudeModelOptions } }
          : { codex: { ...defaults.modelOptions as import("../../shared/types").CodexModelOptions } }

        await socket.command({ type: "chat.send", chatId, provider, content: prompt, model, modelOptions })
      } catch (error) {
        console.warn("[fork] background fork failed:", error instanceof Error ? error.message : String(error))
      } finally {
        setPendingSessionBootstrap((current) => current?.chatId === chatId ? null : current)
      }
    })()
  }

  async function handleMergeSession(chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string, closeSources?: boolean) {
    if (chatIds.length < 1) {
      throw new Error("Select at least 1 session to merge")
    }

    const projectId = pendingMergeProjectId ?? selectedProjectId ?? sidebarData.projectGroups[0]?.groupKey ?? null
    if (!projectId) {
      throw new Error("Open a project first")
    }

    // Step 1: Create chat + navigate instantly
    const { chatId } = await socket.command<{ chatId: string }>({ type: "chat.create", projectId })
    setPendingChatId(chatId)
    setPendingSessionBootstrap({
      chatId,
      kind: "merge",
      phase: "compacting",
      sourceLabels: getSidebarChatLabels(sidebarData.projectGroups, chatIds),
    })
    navigate(`/chat/${chatId}`)
    setSidebarOpen(false)
    setCommandError(null)

    // Step 2: Background — generate prompt + send + optional cleanup
    void (async () => {
      try {
        const { prompt } = await socket.command<{ prompt: string }>({
          type: "chat.generateMergePrompt", chatIds, intent, preset,
        })
        setPendingSessionBootstrap((current) => current?.chatId === chatId
          ? { ...current, phase: "starting" }
          : current)
        const defaults = useChatPreferencesStore.getState().providerDefaults[provider]
        const modelOptions: ModelOptions = provider === "claude"
          ? { claude: { ...defaults.modelOptions as import("../../shared/types").ClaudeModelOptions } }
          : { codex: { ...defaults.modelOptions as import("../../shared/types").CodexModelOptions } }

        await socket.command({ type: "chat.send", chatId, provider, content: prompt, model, modelOptions })

        if (closeSources) {
          for (const sourceId of chatIds) {
            try {
              await socket.command({ type: "chat.delete", chatId: sourceId })
            } catch (deleteError) {
              console.warn("[merge] failed to delete source chat:", sourceId, deleteError instanceof Error ? deleteError.message : String(deleteError))
            }
          }
        }
      } catch (error) {
        console.warn("[merge] background merge failed:", error instanceof Error ? error.message : String(error))
      } finally {
        setPendingSessionBootstrap((current) => current?.chatId === chatId ? null : current)
      }
    })()
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
    orchestrationHierarchy,
    connectionStatus,
    sidebarReady,
    localProjectsReady,
    commandError,
    startingLocalPath,
    sidebarOpen,
    sidebarCollapsed,
    scrollRef,
    sentinelRef,
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
    handleForkSession,
    handleMergeSession,
    pendingMergeProjectId,
    pendingSessionBootstrap,
    requestMerge: (projectId: string) => setPendingMergeProjectId(projectId),
    clearMergeRequest: () => setPendingMergeProjectId(null),
    handleAskUserQuestion,
    handleExitPlanMode,
  }
}
