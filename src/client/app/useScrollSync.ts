import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { isWithinBottomFollowBand, useScrollFollow } from "./useScrollFollow"
import { shouldShowScrollButton } from "./scrollMachine"
import type { ScrollMode } from "./scrollMachine"
import type { ChatSnapshot, HydratedTranscriptMessage } from "../../shared/types"
import { shouldStickToBottomOnComposerSubmit } from "./appState.helpers"
import type { CachedScrollState } from "./useTranscriptLifecycle"

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320

export function shouldReconcileDetachedScrollMode(args: {
  initialScrollCompleted: boolean
  scrollMode: ScrollMode
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): boolean {
  if (!args.initialScrollCompleted) return false
  if (args.scrollMode !== "detached") return false
  const bottomGap = args.scrollHeight - args.scrollTop - args.clientHeight
  return isWithinBottomFollowBand(bottomGap, args.clientHeight)
}

export function useScrollSync(args: {
  activeChatId: string | null
  messages: HydratedTranscriptMessage[]
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
    cachedScrollState,
  } = args

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const initialScrollCompletedRef = useRef(false)
  // Stable ref for cachedScrollState so the layout effect can read it without re-triggering
  const cachedScrollStateRef = useRef(cachedScrollState)
  cachedScrollStateRef.current = cachedScrollState

  const {
    isFollowing,
    modeRef: scrollModeRef,
    scrollToBottom: scrollFollowToBottom,
    handleInitialScrollDone,
    handleChatChanged: scrollFollowChatChanged,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  } = useScrollFollow(scrollRef, sentinelRef)


  // ── Effect A: Session-switch scroll restore (BEFORE paint) ──────────
  // Single authority for scroll positioning on session change.
  // Runs synchronously before the browser paints — eliminates the "swoosh".
  useLayoutEffect(() => {
    initialScrollCompletedRef.current = false
    scrollFollowChatChanged()

    const element = scrollRef.current
    if (!element) return

    const cached = cachedScrollStateRef.current
    if (cached && cached.scrollMode === "detached") {
      // Restore exact cached position — skip anchoring entirely
      beginProgrammaticScroll()
      element.scrollTop = cached.scrollTop
      endProgrammaticScroll()
      initialScrollCompletedRef.current = true
      handleInitialScrollDone("block")
    } else if (messages.length > 0) {
      // Default: scroll to bottom synchronously (before paint)
      beginProgrammaticScroll()
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
      endProgrammaticScroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])


  // ── Effect B: Anchoring stabilization (post-paint) ──────────────────
  // Only runs when NOT already completed (i.e., not restored from detached cache).
  // Handles the virtualizer's async height estimation by polling until stable.
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
      const atBottom = isWithinBottomFollowBand(
        el.scrollHeight - el.scrollTop - el.clientHeight,
        el.clientHeight,
      )
      if (stableCount >= 5 && el.scrollHeight > el.clientHeight && atBottom) {
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


  // ── Effect C: Follow-mode auto-scroll on content changes ────────────
  // Only fires after initial anchoring is complete and mode is "following".
  // Does NOT trigger on activeChatId changes — session switches are Effect A only.
  useLayoutEffect(() => {
    if (!initialScrollCompletedRef.current) return
    const element = scrollRef.current
    if (!element) return

    if (scrollModeRef.current === "following") {
      beginProgrammaticScroll()
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
      const frameId = window.requestAnimationFrame(() => endProgrammaticScroll())
      return () => {
        window.cancelAnimationFrame(frameId)
        endProgrammaticScroll()
      }
    }

    if (shouldReconcileDetachedScrollMode({
      initialScrollCompleted: initialScrollCompletedRef.current,
      scrollMode: scrollModeRef.current,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
    })) {
      scrollFollowToBottom("auto")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginProgrammaticScroll, endProgrammaticScroll, inputHeight, messages.length, runtime?.status, scrollFollowToBottom])


  // ── Effect D: ResizeObserver for content reflow ─────────────────────
  // Keeps scroll pinned to bottom when content resizes during following mode.
  // Gated to post-initial-scroll only.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !activeChatId) return

    const scrollElement = element
    const resizeTarget = scrollElement.firstElementChild instanceof HTMLElement ? scrollElement.firstElementChild : scrollElement

    function keepFollowPinnedOnResize() {
      if (!initialScrollCompletedRef.current) return

      if (scrollModeRef.current === "following") {
        scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: "auto" })
        return
      }

      if (!shouldReconcileDetachedScrollMode({
        initialScrollCompleted: initialScrollCompletedRef.current,
        scrollMode: scrollModeRef.current,
        scrollHeight: scrollElement.scrollHeight,
        scrollTop: scrollElement.scrollTop,
        clientHeight: scrollElement.clientHeight,
      })) return

      scrollFollowToBottom("auto")
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
  }, [activeChatId, scrollFollowToBottom, scrollModeRef])


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
