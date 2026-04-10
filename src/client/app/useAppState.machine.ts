import type { AgentProvider, ModelOptions } from "../../shared/types"
import { appendQueuedText, prependQueuedText } from "./appState.helpers"

export interface ProjectSelectionState {
  explicitProjectId: string | null
  fallbackProjectId: string | null
  activeChatProjectId: string | null
}

export type ProjectSelectionEvent =
  | { type: "sidebar.loaded"; firstProjectId: string | null }
  | { type: "project.explicitly_selected"; projectId: string }
  | { type: "chat.snapshot_received"; projectId: string }
  | { type: "chat.cleared" }

export type ProjectSelectionSource = "none" | "fallback" | "explicit" | "chat_owned"

export interface ResolvedProjectSelection {
  source: ProjectSelectionSource
  projectId: string | null
}

export function createProjectSelectionState(): ProjectSelectionState {
  return {
    explicitProjectId: null,
    fallbackProjectId: null,
    activeChatProjectId: null,
  }
}

export function transitionProjectSelection(
  state: ProjectSelectionState,
  event: ProjectSelectionEvent
): ProjectSelectionState {
  switch (event.type) {
    case "sidebar.loaded":
      return {
        ...state,
        fallbackProjectId: event.firstProjectId,
      }
    case "project.explicitly_selected":
      return {
        ...state,
        explicitProjectId: event.projectId,
      }
    case "chat.snapshot_received":
      return {
        ...state,
        activeChatProjectId: event.projectId,
      }
    case "chat.cleared":
      return {
        ...state,
        activeChatProjectId: null,
      }
  }
}

export function resolveProjectSelection(state: ProjectSelectionState): ResolvedProjectSelection {
  if (state.activeChatProjectId) {
    return { source: "chat_owned", projectId: state.activeChatProjectId }
  }

  if (state.explicitProjectId) {
    return { source: "explicit", projectId: state.explicitProjectId }
  }

  if (state.fallbackProjectId) {
    return { source: "fallback", projectId: state.fallbackProjectId }
  }

  return { source: "none", projectId: null }
}

export interface SubmitPipelineOptions {
  provider?: AgentProvider
  model?: string
  modelOptions?: ModelOptions
  planMode?: boolean
}

export interface SubmitPipelineState {
  queuedTextByChat: Record<string, string>
  blockedFlushKeyByChat: Record<string, string | null>
  awaitingBusyByChat: Record<string, boolean>
  inFlightTextByChat: Record<string, string | undefined>
  optionsByChat: Record<string, SubmitPipelineOptions | undefined>
}

export interface FlushRequest {
  chatId: string
  text: string
  options?: SubmitPipelineOptions
  restoreBlockedKey: string
}

export type SubmitPipelineMode = "idle" | "queued" | "flushing" | "awaiting_busy_ack" | "blocked"

export function createSubmitPipelineState(initialState?: Partial<SubmitPipelineState>): SubmitPipelineState {
  return {
    queuedTextByChat: initialState?.queuedTextByChat ?? {},
    blockedFlushKeyByChat: initialState?.blockedFlushKeyByChat ?? {},
    awaitingBusyByChat: initialState?.awaitingBusyByChat ?? {},
    inFlightTextByChat: initialState?.inFlightTextByChat ?? {},
    optionsByChat: initialState?.optionsByChat ?? {},
  }
}

export function getQueuedFlushKey(chatId: string | null, queuedText: string): string | null {
  const text = queuedText.trim()
  if (chatId === null || !text) return null
  return `${chatId}:${text}`
}

export function getQueuedText(state: SubmitPipelineState, chatId: string | null): string {
  if (!chatId) return ""
  return state.queuedTextByChat[chatId] ?? ""
}

export function queueSubmit(
  state: SubmitPipelineState,
  args: { chatId: string; content: string; options?: SubmitPipelineOptions }
): SubmitPipelineState {
  const nextQueuedText = appendQueuedText(getQueuedText(state, args.chatId), args.content)
  return {
    ...state,
    queuedTextByChat: nextQueuedText
      ? { ...state.queuedTextByChat, [args.chatId]: nextQueuedText }
      : state.queuedTextByChat,
    optionsByChat: { ...state.optionsByChat, [args.chatId]: args.options },
    blockedFlushKeyByChat: { ...state.blockedFlushKeyByChat, [args.chatId]: null },
  }
}

export function getSubmitPipelineMode(state: SubmitPipelineState, chatId: string): SubmitPipelineMode {
  if (state.inFlightTextByChat[chatId] !== undefined) return "flushing"
  if (state.awaitingBusyByChat[chatId] === true) return "awaiting_busy_ack"

  const queuedText = getQueuedText(state, chatId)
  const flushKey = getQueuedFlushKey(chatId, queuedText)
  if (flushKey !== null && state.blockedFlushKeyByChat[chatId] === flushKey) {
    return "blocked"
  }

  if (queuedText.trim()) return "queued"
  return "idle"
}

export function canStartQueuedFlush(
  state: SubmitPipelineState,
  args: { chatId: string | null; isProcessing: boolean }
): boolean {
  if (args.chatId === null || args.isProcessing) return false
  const mode = getSubmitPipelineMode(state, args.chatId)
  if (mode === "queued") return true

  return mode === "awaiting_busy_ack" && getQueuedText(state, args.chatId).trim().length > 0
}

export function startQueuedFlush(
  state: SubmitPipelineState,
  args: { chatId: string; isProcessing: boolean }
): { state: SubmitPipelineState; flushRequest: FlushRequest | null } {
  if (!canStartQueuedFlush(state, args)) {
    return { state, flushRequest: null }
  }

  const text = getQueuedText(state, args.chatId).trim()
  const restoreBlockedKey = getQueuedFlushKey(args.chatId, text)
  if (!restoreBlockedKey) {
    return { state, flushRequest: null }
  }

  const nextState: SubmitPipelineState = {
    ...state,
    queuedTextByChat: Object.fromEntries(
      Object.entries(state.queuedTextByChat).filter(([key]) => key !== args.chatId)
    ),
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [args.chatId]: true },
    inFlightTextByChat: { ...state.inFlightTextByChat, [args.chatId]: text },
  }

  return {
    state: nextState,
    flushRequest: {
      chatId: args.chatId,
      text,
      options: state.optionsByChat[args.chatId],
      restoreBlockedKey,
    },
  }
}

export function markPostFlushBusyObserved(state: SubmitPipelineState, chatId: string): SubmitPipelineState {
  return {
    ...state,
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [chatId]: false },
  }
}

export function startDirectSubmit(
  state: SubmitPipelineState,
  args: { chatId: string; content: string }
): SubmitPipelineState {
  return {
    ...state,
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [args.chatId]: false },
    inFlightTextByChat: { ...state.inFlightTextByChat, [args.chatId]: args.content.trim() },
  }
}

export function completeDirectSubmit(state: SubmitPipelineState, chatId: string): SubmitPipelineState {
  const nextInFlight = { ...state.inFlightTextByChat }
  delete nextInFlight[chatId]

  return {
    ...state,
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [chatId]: true },
    inFlightTextByChat: nextInFlight,
  }
}

export function failDirectSubmit(state: SubmitPipelineState, chatId: string): SubmitPipelineState {
  const nextInFlight = { ...state.inFlightTextByChat }
  delete nextInFlight[chatId]

  return {
    ...state,
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [chatId]: false },
    inFlightTextByChat: nextInFlight,
  }
}

export function completeQueuedFlush(state: SubmitPipelineState, chatId: string): SubmitPipelineState {
  const nextInFlight = { ...state.inFlightTextByChat }
  delete nextInFlight[chatId]

  const queuedText = getQueuedText(state, chatId)
  const nextOptions = { ...state.optionsByChat }
  if (!queuedText) {
    delete nextOptions[chatId]
  }

  return {
    ...state,
    inFlightTextByChat: nextInFlight,
    blockedFlushKeyByChat: { ...state.blockedFlushKeyByChat, [chatId]: null },
    optionsByChat: nextOptions,
  }
}

export function failQueuedFlush(
  state: SubmitPipelineState,
  args: { chatId: string; flushedText: string }
): SubmitPipelineState {
  const nextInFlight = { ...state.inFlightTextByChat }
  delete nextInFlight[args.chatId]

  const restoredQueuedText = prependQueuedText(args.flushedText, getQueuedText(state, args.chatId))
  const restoreBlockedKey = getQueuedFlushKey(args.chatId, args.flushedText)

  return {
    ...state,
    queuedTextByChat: { ...state.queuedTextByChat, [args.chatId]: restoredQueuedText },
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [args.chatId]: false },
    inFlightTextByChat: nextInFlight,
    blockedFlushKeyByChat: { ...state.blockedFlushKeyByChat, [args.chatId]: restoreBlockedKey },
  }
}

export function clearQueuedSubmit(state: SubmitPipelineState, chatId: string): SubmitPipelineState {
  const nextQueued = { ...state.queuedTextByChat }
  delete nextQueued[chatId]

  const nextOptions = { ...state.optionsByChat }
  delete nextOptions[chatId]

  return {
    ...state,
    queuedTextByChat: nextQueued,
    optionsByChat: nextOptions,
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [chatId]: false },
    blockedFlushKeyByChat: { ...state.blockedFlushKeyByChat, [chatId]: null },
  }
}
