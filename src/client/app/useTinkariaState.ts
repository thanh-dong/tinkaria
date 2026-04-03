import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import { PROVIDERS, type AgentProvider, type AskUserQuestionAnswerMap, type DesktopRenderersSnapshot, type KeybindingsSnapshot, type ModelOptions, type ProviderCatalogEntry, type SessionsSnapshot, type UpdateInstallResult, type UpdateSnapshot } from "../../shared/types"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import { useChatReadStateStore } from "../stores/chatReadStateStore"
import { useRightSidebarStore } from "../stores/rightSidebarStore"
import { useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { getEditorPresetLabel, useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"
import { useChatInputStore } from "../stores/chatInputStore"
import type { ChatMessageEvent, ChatRuntime, ChatSnapshot, HydratedTranscriptMessage, LocalProjectsSnapshot, SidebarChatRow, SidebarData, TranscriptEntry } from "../../shared/types"
import type { LocalFilePreview } from "../components/messages/LocalFilePreviewDialog"
import type { AskUserQuestionItem } from "../components/messages/types"
import { useAppDialog } from "../components/ui/app-dialog"
import { createIncrementalHydrator } from "../lib/parseTranscript"
import type { IncrementalHydrator } from "../lib/parseTranscript"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
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
import type { NativeWebviewCommand, NativeWebviewTargetKind } from "../../shared/native-webview"

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

export function getInitialChatScrollTarget(args: {
  activeChatId: string | null
  runtime: ChatRuntime | null
  sidebarReady: boolean
  hasSidebarChat: boolean
  isRead: boolean
}): "wait" | "top" | "bottom" {
  if (
    args.activeChatId
    && (
      !args.runtime
      || !args.sidebarReady
      || !args.hasSidebarChat
    )
  ) return "wait"
  return args.isRead ? "bottom" : "top"
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

export function computeTailOffset(messageCount: number, tailSize = TRANSCRIPT_TAIL_SIZE): number {
  return Math.max(0, messageCount - tailSize)
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
const UI_UPDATE_RESTART_STORAGE_KEY = "kanna:ui-update-restart"

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

const CONTROLLED_CONTENT_WEBVIEW_ID = "controlled-content"

function isPrivateIpv4(hostname: string): boolean {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (!match) return false
  const secondOctet = Number.parseInt(match[1], 10)
  return secondOctet >= 16 && secondOctet <= 31
}

function resolveNativeWebviewTargetKind(url: URL): NativeWebviewTargetKind {
  const hostname = url.hostname.toLowerCase()
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || isPrivateIpv4(hostname)) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
      ? "local-port"
      : "lan-host"
  }
  if (!hostname.includes(".") || hostname.endsWith(".local")) {
    return "lan-host"
  }
  return "proxied-remote"
}

export function resolveDesktopWebviewOpenCommand(args: {
  href: string
  desktopRenderers: DesktopRenderersSnapshot
}): Extract<NativeWebviewCommand, { type: "webview.open" }> | null {
  const renderer = args.desktopRenderers.renderers.find((candidate) => candidate.capabilities.includes("native_webview"))
  if (!renderer) return null

  let url: URL
  try {
    url = new URL(args.href)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null
  }

  return {
    type: "webview.open",
    rendererId: renderer.rendererId,
    webviewId: CONTROLLED_CONTENT_WEBVIEW_ID,
    targetKind: resolveNativeWebviewTargetKind(url),
    target: url.toString(),
    dockState: "docked",
  }
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
  keybindings: KeybindingsSnapshot | null
  desktopRenderers: DesktopRenderersSnapshot
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
  availableProviders: ProviderCatalogEntry[]
  isProcessing: boolean
  canCancel: boolean
  queuedText: string
  transcriptPaddingBottom: number
  showScrollButton: boolean
  navbarLocalPath?: string
  editorLabel: string
  hasSelectedProject: boolean
  localFilePreview: LocalFilePreview | null
  openSidebar: () => void
  closeSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
  closeLocalFilePreview: () => void
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
  handleOpenExternal: (action: "open_finder" | "open_terminal" | "open_editor") => Promise<void>
  handleOpenExternalPath: (action: "open_finder" | "open_editor", localPath: string) => Promise<void>
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
  const hydratorRef = useRef<IncrementalHydrator>(createIncrementalHydrator())
  const [messages, setMessages] = useState<HydratedTranscriptMessage[]>([])
  const [keybindings, setKeybindings] = useState<KeybindingsSnapshot | null>(null)
  const [desktopRenderers, setDesktopRenderers] = useState<DesktopRenderersSnapshot>({ renderers: [] })
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
  const activeSessionsSubs = useRef<Map<string, () => void>>(new Map())
  const editorLabel = getEditorPresetLabel(useTerminalPreferencesStore((store) => store.editorPreset))
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

  useEffect(() => socket.onStatus(setConnectionStatus), [socket])

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
      setSidebarReady(true)
      setCommandError(null)
    })
  }, [socket])

  useEffect(() => {
    return socket.subscribe<LocalProjectsSnapshot>({ type: "local-projects" }, (snapshot) => {
      setLocalProjects(snapshot)
      setLocalProjectsReady(true)
      setCommandError(null)
    })
  }, [socket])

  useEffect(() => {
    return socket.subscribe<UpdateSnapshot>({ type: "update" }, (snapshot) => {
      setUpdateSnapshot(snapshot)
      setCommandError(null)
    })
  }, [socket])

  useEffect(() => {
    return socket.subscribe<DesktopRenderersSnapshot>({ type: "desktop-renderers" }, (snapshot) => {
      setDesktopRenderers(snapshot)
      setCommandError(null)
    })
  }, [socket])

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
    return socket.subscribe<KeybindingsSnapshot>({ type: "keybindings" }, (snapshot) => {
      setKeybindings(snapshot)
      setCommandError(null)
    })
  }, [socket])

  useEffect(() => {
    if (!activeChatId) {
      logTinkariaState("clearing chat snapshot for non-chat route")
      setChatSnapshot(null)
      setProjectSelection((current) => transitionProjectSelection(current, { type: "chat.cleared" }))
      hydratorRef.current.reset()
      setMessages([])
      setChatReady(true)
      return
    }

    logTinkariaState("subscribing to chat", { activeChatId })
    setChatSnapshot(null)
    hydratorRef.current.reset()
    setMessages([])
    setChatReady(false)

    // Buffer message events that arrive before the initial fetch completes
    let initialFetchDone = false
    let fetchTriggered = false
    const buffer: TranscriptEntry[] = []
    const chatId = activeChatId
    const hydrator = hydratorRef.current

    function flushTail(entries: TranscriptEntry[]) {
      initialFetchDone = true
      const allEntries = buffer.length > 0 ? [...entries, ...buffer] : entries
      buffer.length = 0
      hydrator.reset()
      for (const entry of allEntries) hydrator.hydrate(entry)
      setMessages(hydrator.getMessages())
    }

    async function fetchTail(messageCount: number) {
      if (fetchTriggered) return
      fetchTriggered = true
      try {
        const offset = computeTailOffset(messageCount)
        const entries = await socket.command<TranscriptEntry[]>({
          type: "chat.getMessages", chatId, offset, limit: TRANSCRIPT_TAIL_SIZE,
        })
        flushTail(entries)
      } catch {
        flushTail([])
      }
    }

    const unsub = socket.subscribe<ChatSnapshot | null, ChatMessageEvent>(
      { type: "chat", chatId: activeChatId },
      (snapshot) => {
        logTinkariaState("chat snapshot received", {
          activeChatId,
          snapshotChatId: snapshot?.runtime.chatId ?? null,
          snapshotProvider: snapshot?.runtime.provider ?? null,
          snapshotStatus: snapshot?.runtime.status ?? null,
        })
        setChatSnapshot(snapshot)
        if (snapshot) {
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
        if (event.chatId !== activeChatId) return
        if (initialFetchDone) {
          hydrator.hydrate(event.entry)
          setMessages(hydrator.getMessages())
        } else {
          buffer.push(event.entry)
        }
      }
    )

    return unsub
  }, [activeChatId, socket])

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
  const runtime = activeChatSnapshot?.runtime ?? null
  const availableProviders = activeChatSnapshot?.availableProviders ?? PROVIDERS
  const isProcessing = isProcessingStatus(runtime?.status)
  const canCancel = canCancelStatus(runtime?.status)
  const hasResolvedActiveSidebarChat = !activeChatId || activeSidebarChat !== null
  const activeChatIsRead = isChatRead(lastSeenMessageAt, activeSidebarChat?.lastMessageAt)

  useEffect(() => {
    initialScrollCompletedRef.current = false
    if (initialScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(initialScrollFrameRef.current)
      initialScrollFrameRef.current = null
    }
    setIsAtBottom(activeChatIsRead && hasResolvedActiveSidebarChat)
  }, [activeChatId, activeChatIsRead, hasResolvedActiveSidebarChat])

  const initialChatScrollTarget = getInitialChatScrollTarget({
    activeChatId,
    runtime,
    sidebarReady,
    hasSidebarChat: hasResolvedActiveSidebarChat,
    isRead: activeChatIsRead,
  })

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

  useLayoutEffect(() => {
    if (initialScrollCompletedRef.current) return

    const element = scrollRef.current
    if (!element) return
    if (initialChatScrollTarget === "wait") return

    if (initialChatScrollTarget === "top") {
      element.scrollTo({ top: 0, behavior: "auto" })
      initialScrollCompletedRef.current = true
      return
    }

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
  }, [activeChatId, initialChatScrollTarget, inputHeight, messages.length])

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
    if (!activeChatId || !isAtBottom) return
    const lastMessageAt = activeSidebarChat?.lastMessageAt
    if (lastMessageAt === undefined) return
    markChatRead(activeChatId, lastMessageAt)
  }, [activeChatId, activeSidebarChat?.lastMessageAt, isAtBottom, markChatRead])

  function updateScrollState() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setIsAtBottom(shouldAutoFollowTranscript(distance))
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
        markChatRead(activeChatId, readTimestampToPersist)
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

  async function handleOpenExternal(action: "open_finder" | "open_terminal" | "open_editor") {
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

  async function handleOpenExternalPath(action: "open_finder" | "open_editor", localPath: string) {
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
    const command = resolveDesktopWebviewOpenCommand({
      href,
      desktopRenderers,
    })
    if (!command) return false

    void socket.command(command).catch((error) => {
      setCommandError(error instanceof Error ? error.message : String(error))
    })
    return true
  }

  async function openExternal(command: {
    action: "open_finder" | "open_terminal" | "open_editor"
    localPath: string
    line?: number
    column?: number
  }) {
    const preferences = useTerminalPreferencesStore.getState()
    setCommandError(null)
    await socket.command({
      type: "system.openExternal",
      ...command,
      editor: command.action === "open_editor"
        ? {
            preset: preferences.editorPreset,
            commandTemplate: preferences.editorCommandTemplate,
          }
        : undefined,
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
    keybindings,
    desktopRenderers,
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
    availableProviders,
    isProcessing,
    canCancel,
    queuedText: activeQueuedText,
    transcriptPaddingBottom,
    showScrollButton,
    navbarLocalPath,
    editorLabel,
    hasSelectedProject,
    localFilePreview,
    openSidebar: () => setSidebarOpen(true),
    closeSidebar: () => setSidebarOpen(false),
    collapseSidebar: () => setSidebarCollapsed(true),
    expandSidebar: () => setSidebarCollapsed(false),
    closeLocalFilePreview: () => setLocalFilePreview(null),
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
