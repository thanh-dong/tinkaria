import { useCallback, useState } from "react"
import type { useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import type {
  AgentProvider,
  AskUserQuestionAnswerMap,
  AskUserQuestionItem,
  ModelOptions,
  SessionsSnapshot,
  UpdateInstallResult,
  UpdateSnapshot,
} from "../../shared/types"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import { useChatInputStore } from "../stores/chatInputStore"
import { useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useRightSidebarStore } from "../stores/rightSidebarStore"
import type { ChatSnapshot, HydratedTranscriptMessage, LocalProjectsSnapshot, SidebarChatRow, SidebarData } from "../../shared/types"
import type { LocalFilePreview } from "../components/messages/LocalFilePreviewDialog"
import type { useAppDialog } from "../components/ui/app-dialog"
import { deleteCachedChat } from "./chatCache"
import {
  getNewestRemainingChatId,
  getReadableBlockCount,
  getReadTimestampToPersistAfterReply,
  getSidebarChatLabels,
  getSidebarChatRow,
  normalizeLocalFilePreviewErrorMessage,
  resolveComposeIntent,
  shouldQueueChatSubmit,
  type PendingSessionBootstrap,
  type ProjectRequest,
  type StartChatIntent,
} from "./appState.helpers"
import type { AppTransport } from "./socket-interface"
import type { SubmitPipelineState } from "./useAppState.machine"
import {
  completeQueuedFlush,
  failQueuedFlush,
  getSubmitPipelineMode,
  markPostFlushBusyObserved,
  startQueuedFlush,
  transitionProjectSelection,
  queueSubmit as queueSubmitTransition,
} from "./useAppState.machine"
import { isProcessingStatus } from "./derived"

// --- Module-private helpers for UI update restart flow ---

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

// Re-export so useAppState.ts can still reach them for its connectionStatus effect
export { getUiUpdateRestartPhase, setUiUpdateRestartPhase, clearUiUpdateRestartPhase, UI_UPDATE_RESTART_STORAGE_KEY }

export interface ChatCommandsArgs {
  socket: AppTransport
  activeChatId: string | null
  navigate: ReturnType<typeof useNavigate>
  dialog: ReturnType<typeof useAppDialog>
  sidebarData: SidebarData
  chatSnapshot: ChatSnapshot | null
  runtime: ChatSnapshot["runtime"] | null
  selectedProjectId: string | null
  fallbackLocalProjectPath: string | null
  isProcessing: boolean
  messages: HydratedTranscriptMessage[]
  latestReadableMessage: HydratedTranscriptMessage | null
  lastSeenMessageAt: number | undefined
  activeSidebarChat: SidebarChatRow | null
  localProjects: LocalProjectsSnapshot | null
  setProjectSelection: React.Dispatch<React.SetStateAction<import("./useAppState.machine").ProjectSelectionState>>
  setPendingChatId: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setCommandError: (error: string | null) => void
  setNormalizedCommandError: (error: unknown) => void
  markChatRead: (chatId: string, boundary: { messageId?: string; blockIndex?: number; lastMessageAt?: number }) => void
  clearChatReadState: (chatId: string) => void
  scrollFollowToBottom: (behavior?: ScrollBehavior) => void
  keepComposerSubmitAnchored: () => void
  activeQueuedText: string
  updateSubmitPipeline: (updater: (current: SubmitPipelineState) => SubmitPipelineState) => SubmitPipelineState
  submitPipeline: SubmitPipelineState
  submitPipelineRef: React.MutableRefObject<SubmitPipelineState>
  activeSessionsSubs: React.MutableRefObject<Map<string, () => void>>
}

export interface ChatCommandsReturn {
  // State
  localFilePreview: LocalFilePreview | null
  startingLocalPath: string | null
  pendingSessionBootstrap: PendingSessionBootstrap | null
  pendingMergeProjectId: string | null
  sessionsSnapshots: Map<string, SessionsSnapshot>
  sessionsWindowDays: Map<string, number>

  // Handlers
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
  handleDeleteChat: (chat: SidebarChatRow) => Promise<void>
  handleRenameChat: (chatId: string, title: string) => Promise<void>
  handleRemoveProject: (projectId: string) => Promise<void>
  handleOpenExternal: (action: "open_finder") => Promise<void>
  handleOpenExternalPath: (action: "open_finder", localPath: string) => Promise<void>
  handleOpenLocalLink: (target: { path: string; line?: number; column?: number }) => Promise<void>
  handleOpenExternalLink: (href: string) => boolean
  closeLocalFilePreview: () => void
  handleOpenSessionPicker: (projectId: string, open: boolean) => void
  handleResumeSession: (projectId: string, sessionId: string, provider: AgentProvider) => Promise<void>
  handleRefreshSessions: (projectId: string) => void
  handleShowMoreSessions: (projectId: string) => void
  handleCompose: () => void
  handleForkSession: (intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
  handleMergeSession: (chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string, closeSources?: boolean) => Promise<void>
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

  // For useAppState subscription effect — command handlers update the submit pipeline
  // when snapshots arrive, so we expose the internal maybeFlushQueuedSubmit
  updateSubmitPipelineFromSnapshot: (snapshot: ChatSnapshot) => void
}

export function useChatCommands(args: ChatCommandsArgs): ChatCommandsReturn {
  const {
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
    latestReadableMessage,
    lastSeenMessageAt,
    activeSidebarChat,
    localProjects,
    setProjectSelection,
    setPendingChatId,
    setSidebarOpen,
    setCommandError,
    scrollFollowToBottom,
    keepComposerSubmitAnchored,
    activeQueuedText,
    updateSubmitPipeline,
    submitPipeline,
    submitPipelineRef,
    markChatRead,
    clearChatReadState,
    activeSessionsSubs,
  } = args

  // --- State owned by command handlers ---

  const [localFilePreview, setLocalFilePreview] = useState<LocalFilePreview | null>(null)
  const [startingLocalPath, setStartingLocalPath] = useState<string | null>(null)
  const [pendingMergeProjectId, setPendingMergeProjectId] = useState<string | null>(null)
  const [pendingSessionBootstrap, setPendingSessionBootstrap] = useState<PendingSessionBootstrap | null>(null)
  const [sessionsSnapshots, setSessionsSnapshots] = useState<Map<string, SessionsSnapshot>>(new Map())
  const [sessionsWindowDays, setSessionsWindowDays] = useState<Map<string, number>>(new Map())

  // --- Internal helpers ---

  function maybeFlushQueuedSubmit(chatId: string, chatIsProcessing: boolean) {
    const { state: nextState, flushRequest } = startQueuedFlush(submitPipelineRef.current, {
      chatId,
      isProcessing: chatIsProcessing,
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

  function updateSubmitPipelineFromSnapshot(snapshot: ChatSnapshot) {
    if (isProcessingStatus(snapshot.runtime.status)) {
      updateSubmitPipeline((current) => markPostFlushBusyObserved(current, snapshot.runtime.chatId))
    } else {
      maybeFlushQueuedSubmit(snapshot.runtime.chatId, false)
    }
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

  // --- Navigation/creation commands ---

  async function handleCreateChat(projectId: string) {
    await startChatFromIntent({ kind: "project_id", projectId })
  }

  async function handleOpenLocalProject(localPath: string) {
    await startChatFromIntent({ kind: "local_path", localPath })
  }

  async function handleCreateProject(project: ProjectRequest) {
    await startChatFromIntent({ kind: "project_request", project })
  }

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

  // --- Chat lifecycle commands ---

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
      return "sent" as const
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
      return "queued" as const
    }

    await handleSend(content, options)
    return "sent" as const
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

  // --- Project commands ---

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

  // --- Update commands ---

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

  // --- External link commands ---

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

  function handleOpenExternalLink(href: string): boolean {
    void href
    return false
  }

  // --- Session commands ---

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
    [navigate, setPendingChatId, setCommandError, socket]
  )

  const handleRefreshSessions = useCallback(
    (projectId: string) => {
      void socket.command({ type: "sessions.refresh", projectId }).catch((error) => {
        setCommandError(error instanceof Error ? error.message : String(error))
      })
    },
    [setCommandError, socket]
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

  // --- Fork/merge commands ---

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

  // --- Tool response commands ---

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
    // State
    localFilePreview,
    startingLocalPath,
    pendingSessionBootstrap,
    pendingMergeProjectId,
    sessionsSnapshots,
    sessionsWindowDays,

    // Handlers
    handleCreateChat,
    handleOpenLocalProject,
    handleCreateProject,
    handleCheckForUpdates,
    handleInstallUpdate,
    handleSend,
    handleSubmitFromComposer,
    handleCancel,
    handleDeleteChat,
    handleRenameChat,
    handleRemoveProject,
    handleOpenExternal,
    handleOpenExternalPath,
    handleOpenLocalLink,
    handleOpenExternalLink,
    closeLocalFilePreview: () => setLocalFilePreview(null),
    handleOpenSessionPicker,
    handleResumeSession,
    handleRefreshSessions,
    handleShowMoreSessions,
    handleCompose,
    handleForkSession,
    handleMergeSession,
    requestMerge: (projectId: string) => setPendingMergeProjectId(projectId),
    clearMergeRequest: () => setPendingMergeProjectId(null),
    handleAskUserQuestion,
    handleExitPlanMode,

    // Internal — for useAppState subscription effect
    updateSubmitPipelineFromSnapshot,
  }
}
