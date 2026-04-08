import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useScrollFollow } from "./useScrollFollow"
import { shouldShowScrollButton } from "./scrollMachine"
import { useNavigate } from "react-router-dom"
import {
  PROVIDERS,
  type AgentProvider,
  type AskUserQuestionAnswerMap,
  type AskUserQuestionItem,
  type CurrentRepoStatusSnapshot,
  type CurrentSessionSnapshot,
  type ModelOptions,
  type OrchestrationHierarchySnapshot,
  type ProviderCatalogEntry,
  type SessionsSnapshot,
  type UpdateSnapshot,
} from "../../shared/types"
import { useChatReadStateStore } from "../stores/chatReadStateStore"
import { useChatInputStore } from "../stores/chatInputStore"
import type { ChatSnapshot, HydratedTranscriptMessage, LocalProjectsSnapshot, SidebarChatRow, SidebarData } from "../../shared/types"
import type { LocalFilePreview } from "../components/messages/LocalFilePreviewDialog"
import { useAppDialog } from "../components/ui/app-dialog"
import { useSessionPolling } from "./useSessionPolling"
import { clearChatCache, markCachedChatsStale } from "./chatCache"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
import {
  createProjectSelectionState,
  resolveProjectSelection,
  transitionProjectSelection,
} from "./useAppState.machine"
import { useSubmitPipeline } from "./useSubmitPipeline"
import { NatsSocket } from "./nats-socket"
import type { AppTransport, SocketStatus } from "./socket-interface"
import {
  compareReadBoundary,
  getActiveChatSnapshot,
  getHookReadProgressBoundary,
  getInitialChatReadAnchor,
  getLastReadableMessage,
  getReadableBlockCount,
  getSidebarChatRow,
  getUiUpdateRestartReconnectAction,
  normalizeCommandErrorMessage,
  resolveLockedAnchor,
  shouldStickToBottomOnComposerSubmit,
  type InitialChatReadAnchor,
  type LockedAnchorState,
  type PendingSessionBootstrap,
  type ProjectRequest,
} from "./appState.helpers"
import { usePwaResume } from "./usePwaResume"
import { useTranscriptLifecycle } from "./useTranscriptLifecycle"
import { useChatCommands, getUiUpdateRestartPhase, setUiUpdateRestartPhase, clearUiUpdateRestartPhase } from "./useChatCommands"

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
  const [connectionStatus, setConnectionStatus] = useState<SocketStatus>("connecting")
  const [sidebarReady, setSidebarReady] = useState(false)
  const [localProjectsReady, setLocalProjectsReady] = useState(false)
  const [projectSelection, setProjectSelection] = useState(createProjectSelectionState)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputHeight, setInputHeight] = useState(148)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [pendingChatId, setPendingChatId] = useState<string | null>(null)
  const {
    submitPipelineRef,
    submitPipeline,
    activeQueuedText,
    updateSubmitPipeline,
    clearQueuedText,
    restoreQueuedText,
  } = useSubmitPipeline({ activeChatId })
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
  const activeSessionsSubs = useRef<Map<string, () => void>>(new Map())
  const snapshotCallbackRef = useRef<(snapshot: ChatSnapshot) => void>(() => {})

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

  const handleChatSnapshotReceived = useCallback((snapshot: ChatSnapshot) => {
    snapshotCallbackRef.current(snapshot)
  }, [])

  const {
    messages,
    chatSnapshot,
    orchestrationHierarchy,
  } = useTranscriptLifecycle({
    socket,
    activeChatId,
    resumeRefreshNonce,
    sidebarData,
    sidebarReady,
    pendingChatId,
    setPendingChatId,
    navigate,
    setProjectSelection,
    setCommandError,
    onChatSnapshotReceived: handleChatSnapshotReceived,
  })

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

  const commands = useChatCommands({
    socket,
    activeChatId,
    navigate,
    dialog,
    sidebarData,
    chatSnapshot,
    runtime,
    selectedProjectId,
    fallbackLocalProjectPath,
    isProcessing,
    messages,
    latestReadableMessage,
    lastSeenMessageAt,
    activeSidebarChat,
    localProjects,
    setProjectSelection,
    setPendingChatId,
    setSidebarOpen,
    setCommandError,
    setNormalizedCommandError,
    scrollFollowToBottom,
    keepComposerSubmitAnchored,
    activeQueuedText,
    updateSubmitPipeline,
    submitPipeline,
    submitPipelineRef,
    markChatRead,
    clearChatReadState,
    activeSessionsSubs,
  })

  // Wire up the snapshot callback ref now that commands is available
  snapshotCallbackRef.current = commands.updateSubmitPipelineFromSnapshot

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
    startingLocalPath: commands.startingLocalPath,
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
    localFilePreview: commands.localFilePreview,
    openSidebar: () => {
      setSidebarOpen(true)
      if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
        (document.activeElement as HTMLElement)?.blur?.()
      }
    },
    closeSidebar: () => setSidebarOpen(false),
    collapseSidebar: () => setSidebarCollapsed(true),
    expandSidebar: () => setSidebarCollapsed(false),
    closeLocalFilePreview: commands.closeLocalFilePreview,
    handleInitialReadAnchorScrolled,
    scrollToBottom,
    handleCreateChat: commands.handleCreateChat,
    handleOpenLocalProject: commands.handleOpenLocalProject,
    handleCreateProject: commands.handleCreateProject,
    handleCheckForUpdates: commands.handleCheckForUpdates,
    handleInstallUpdate: commands.handleInstallUpdate,
    handleSend: commands.handleSend,
    handleSubmitFromComposer: commands.handleSubmitFromComposer,
    handleCancel: commands.handleCancel,
    clearQueuedText,
    restoreQueuedText,
    handleDeleteChat: commands.handleDeleteChat,
    handleRenameChat: commands.handleRenameChat,
    handleRemoveProject: commands.handleRemoveProject,
    handleOpenExternal: commands.handleOpenExternal,
    handleOpenExternalPath: commands.handleOpenExternalPath,
    handleOpenLocalLink: commands.handleOpenLocalLink,
    handleOpenExternalLink: commands.handleOpenExternalLink,
    sessionsSnapshots: commands.sessionsSnapshots,
    sessionsWindowDays: commands.sessionsWindowDays,
    handleOpenSessionPicker: commands.handleOpenSessionPicker,
    handleResumeSession: commands.handleResumeSession,
    handleRefreshSessions: commands.handleRefreshSessions,
    handleShowMoreSessions: commands.handleShowMoreSessions,
    handleCompose: commands.handleCompose,
    handleForkSession: commands.handleForkSession,
    handleMergeSession: commands.handleMergeSession,
    pendingMergeProjectId: commands.pendingMergeProjectId,
    pendingSessionBootstrap: commands.pendingSessionBootstrap,
    requestMerge: commands.requestMerge,
    clearMergeRequest: commands.clearMergeRequest,
    handleAskUserQuestion: commands.handleAskUserQuestion,
    handleExitPlanMode: commands.handleExitPlanMode,
  }
}
