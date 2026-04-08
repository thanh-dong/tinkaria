import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
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
  getActiveChatSnapshot,
  getLastReadableMessage,
  getSidebarChatRow,
  getUiUpdateRestartReconnectAction,
  normalizeCommandErrorMessage,
  type PendingSessionBootstrap,
  type ProjectRequest,
} from "./appState.helpers"
import { usePwaResume } from "./usePwaResume"
import { useScrollSync } from "./useScrollSync"
import { useTranscriptLifecycle } from "./useTranscriptLifecycle"
import { useChatCommands, getUiUpdateRestartPhase, setUiUpdateRestartPhase, clearUiUpdateRestartPhase } from "./useChatCommands"

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

export { type CachedChatState, MAX_CACHED_CHATS } from "./chatCache"

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

  const inputRef = useRef<HTMLDivElement>(null)
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

  const {
    scrollRef,
    sentinelRef,
    scrollFollowToBottom,
    showScrollButton,
    transcriptPaddingBottom,
    initialReadAnchorMessageId,
    initialReadAnchorBlockIndex,
    handleInitialReadAnchorScrolled,
    scrollToBottom,
    keepComposerSubmitAnchored,
  } = useScrollSync({
    activeChatId,
    messages,
    sidebarReady,
    hasSidebarChat: hasResolvedActiveSidebarChat,
    inputHeight,
    runtime,
    lastReadBlockIndex,
    lastReadMessageId,
    lastSeenMessageAt,
    lastMessageAt: activeSidebarChat?.lastMessageAt,
    latestReadableMessage,
    markChatRead,
  })

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

  const { currentSessionRuntime, currentRepoStatus } = useSessionPolling({
    socket,
    activeChatId,
    sessionProvider: activeChatSnapshot?.runtime.provider,
    sessionToken: activeChatSnapshot?.runtime.sessionToken,
    isProcessing,
    resumeRefreshNonce,
  })

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
