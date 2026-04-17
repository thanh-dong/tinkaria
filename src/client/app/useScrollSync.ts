import { useRef, type RefObject } from "react"
import { useScrollFollow } from "./useScrollFollow"
import { shouldShowScrollButton } from "./scrollMachine"
import type { ChatSnapshot, TranscriptRenderUnit } from "../../shared/types"
import { shouldStickToBottomOnComposerSubmit } from "./appState.helpers"
import type { CachedScrollState } from "./useTranscriptLifecycle"
import { useScrollRestore } from "./useScrollRestore"
import { useScrollAutoFollow } from "./useScrollAutoFollow"
import { useScrollReflowPin } from "./useScrollReflowPin"

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320

export function useScrollSync(args: {
  activeChatId: string | null
  messages: TranscriptRenderUnit[]
  sidebarReady: boolean
  hasSidebarChat: boolean
  inputHeight: number
  runtime: ChatSnapshot["runtime"] | null
  cachedScrollState: CachedScrollState | null
}): {
  scrollRef: RefObject<HTMLDivElement | null>
  sentinelRef: RefObject<HTMLDivElement | null>
  isFollowing: boolean
  scrollFollowToBottom: (behavior?: ScrollBehavior) => void
  showScrollButton: boolean
  transcriptPaddingBottom: number
  scrollToBottom: () => void
  keepComposerSubmitAnchored: () => void
  scrollModeRef: RefObject<string>
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
} {
  const {
    activeChatId,
    messages,
    inputHeight,
    runtime,
    cachedScrollState,
  } = args

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    isFollowing,
    modeRef: scrollModeRef,
    scrollToBottom: scrollFollowToBottom,
    handleInitialScrollDone,
    handleChatChanged: scrollFollowChatChanged,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  } = useScrollFollow(scrollRef, sentinelRef)

  const { phaseRef } = useScrollRestore({
    activeChatId,
    scrollRef,
    messages,
    cachedScrollState,
    onChatChanged: scrollFollowChatChanged,
    onInitialScrollDone: handleInitialScrollDone,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  })

  useScrollAutoFollow({
    scrollRef,
    anchoringPhase: phaseRef,
    scrollModeRef,
    beginProgrammaticScroll,
    endProgrammaticScroll,
    messageCount: messages.length,
    runtimeStatus: runtime?.status,
    inputHeight,
  })

  useScrollReflowPin({
    activeChatId,
    scrollRef,
    anchoringPhase: phaseRef,
    scrollModeRef,
    scrollFollowToBottom,
  })

  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = shouldShowScrollButton(scrollModeRef.current, messages.length)

  function scrollToBottom() {
    scrollFollowToBottom("smooth")
  }

  function keepComposerSubmitAnchored() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (!shouldStickToBottomOnComposerSubmit(distance, element.clientHeight)) return
    scrollFollowToBottom("auto")
  }

  return {
    scrollRef,
    sentinelRef,
    isFollowing,
    scrollFollowToBottom,
    showScrollButton,
    transcriptPaddingBottom,
    scrollToBottom,
    keepComposerSubmitAnchored,
    scrollModeRef,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  }
}
