import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { useScrollFollow } from "./useScrollFollow"
import { shouldShowScrollButton } from "./scrollMachine"
import type { ChatSnapshot, HydratedTranscriptMessage } from "../../shared/types"
import { shouldStickToBottomOnComposerSubmit } from "./appState.helpers"

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320

export function useScrollSync(args: {
  activeChatId: string | null
  messages: HydratedTranscriptMessage[]
  sidebarReady: boolean
  hasSidebarChat: boolean
  inputHeight: number
  runtime: ChatSnapshot["runtime"] | null
}): {
  scrollRef: RefObject<HTMLDivElement | null>
  sentinelRef: RefObject<HTMLDivElement | null>
  isFollowing: boolean
  scrollFollowToBottom: (behavior?: ScrollBehavior) => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
  showScrollButton: boolean
  transcriptPaddingBottom: number
  scrollToBottom: () => void
  keepComposerSubmitAnchored: () => void
  initialScrollCompletedRef: RefObject<boolean>
  scrollModeRef: RefObject<string>
} {
  const {
    activeChatId,
    messages,
    inputHeight,
    runtime,
  } = args


  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
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


  useLayoutEffect(() => {
    initialScrollCompletedRef.current = false
    scrollFollowChatChanged()
  }, [activeChatId, scrollFollowChatChanged])


  useEffect(() => {
    if (initialScrollCompletedRef.current) return
    if (messages.length === 0) return
    const element = scrollRef.current
    if (!element) return

    beginProgrammaticScroll()
    let lastScrollHeight = 0
    let stableCount = 0
    const interval = window.setInterval(() => {
      const el = scrollRef.current
      if (!el || !el.isConnected) { window.clearInterval(interval); endProgrammaticScroll(); return }
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
      if (el.scrollHeight === lastScrollHeight) {
        stableCount++
      } else {
        lastScrollHeight = el.scrollHeight
        stableCount = 0
      }
      if (stableCount >= 5 && el.scrollHeight > el.clientHeight) {
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
  }, [activeChatId, beginProgrammaticScroll, endProgrammaticScroll, handleInitialScrollDone, messages.length])


  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = shouldShowScrollButton(scrollModeRef.current, messages.length)


  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const wantsTail = !initialScrollCompletedRef.current && messages.length > 0
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
  }, [activeChatId, beginProgrammaticScroll, endProgrammaticScroll, inputHeight, messages.length, runtime?.status, scrollModeRef])


  useEffect(() => {
    const element = scrollRef.current
    if (!element || !activeChatId) return

    const scrollElement = element
    const resizeTarget = scrollElement.firstElementChild instanceof HTMLElement ? scrollElement.firstElementChild : scrollElement

    function keepFollowPinnedOnResize() {
      if (!initialScrollCompletedRef.current || scrollModeRef.current !== "following") return
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: "auto" })
    }

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          keepFollowPinnedOnResize()
        })
    resizeObserver?.observe(resizeTarget)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [activeChatId, scrollModeRef])


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
    beginProgrammaticScroll,
    endProgrammaticScroll,
    showScrollButton,
    transcriptPaddingBottom,
    scrollToBottom,
    keepComposerSubmitAnchored,
    initialScrollCompletedRef,
    scrollModeRef,
  }
}
