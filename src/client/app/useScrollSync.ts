import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react"
import { useScrollFollow } from "./useScrollFollow"
import { shouldShowScrollButton } from "./scrollMachine"
import type { ChatSnapshot, HydratedTranscriptMessage } from "../../shared/types"
import {
  compareReadBoundary,
  getHookReadProgressBoundary,
  getInitialChatReadAnchor,
  getReadableBlockCount,
  resolveLockedAnchor,
  shouldStickToBottomOnComposerSubmit,
  type InitialChatReadAnchor,
  type LockedAnchorState,
} from "./appState.helpers"

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320

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

export function useScrollSync(args: {
  activeChatId: string | null
  messages: HydratedTranscriptMessage[]
  sidebarReady: boolean
  hasSidebarChat: boolean
  inputHeight: number
  runtime: ChatSnapshot["runtime"] | null
  lastReadBlockIndex: number | undefined
  lastReadMessageId: string | undefined
  lastSeenMessageAt: number | undefined
  lastMessageAt: number | undefined
  latestReadableMessage: HydratedTranscriptMessage | null
  markChatRead: (chatId: string, boundary: { messageId?: string; blockIndex?: number; lastMessageAt?: number }) => void
}): {
  scrollRef: RefObject<HTMLDivElement | null>
  sentinelRef: RefObject<HTMLDivElement | null>
  isFollowing: boolean
  scrollFollowToBottom: (behavior?: ScrollBehavior) => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
  showScrollButton: boolean
  transcriptPaddingBottom: number
  initialReadAnchorMessageId: string | null
  initialReadAnchorBlockIndex: number | null
  handleInitialReadAnchorScrolled: () => void
  scrollToBottom: () => void
  keepComposerSubmitAnchored: () => void
  initialScrollCompletedRef: RefObject<boolean>
  scrollModeRef: RefObject<string>
} {
  const {
    activeChatId,
    messages,
    sidebarReady,
    hasSidebarChat,
    inputHeight,
    runtime,
    lastReadBlockIndex,
    lastReadMessageId,
    lastSeenMessageAt,
    lastMessageAt,
    latestReadableMessage,
    markChatRead,
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


  const nextInitialChatReadAnchor = getInitialChatReadAnchor({
    activeChatId,
    sidebarReady,
    hasSidebarChat,
    messages,
    lastReadMessageId,
    lastReadBlockIndex,
    lastSeenMessageAt,
    lastMessageAt,
  })
  const initialChatReadAnchor = useLockedAnchor(activeChatId, nextInitialChatReadAnchor, initialScrollCompletedRef)


  useLayoutEffect(() => {
    initialScrollCompletedRef.current = false
    scrollFollowChatChanged()
  }, [activeChatId, scrollFollowChatChanged])


  useEffect(() => {
    if (initialScrollCompletedRef.current) return
    if (initialChatReadAnchor.kind !== "tail") return
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
  }, [activeChatId, beginProgrammaticScroll, endProgrammaticScroll, handleInitialScrollDone, initialChatReadAnchor.kind, messages.length])


  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = shouldShowScrollButton(scrollModeRef.current, messages.length)
  const initialReadAnchorMessageId = initialChatReadAnchor.kind === "block" ? initialChatReadAnchor.messageId : null
  const initialReadAnchorBlockIndex = initialChatReadAnchor.kind === "block" ? initialChatReadAnchor.blockIndex : null


  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

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


  useEffect(() => {
    if (!activeChatId) return
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
  }, [activeChatId, lastMessageAt, isFollowing, lastReadBlockIndex, lastReadMessageId, latestReadableMessage, markChatRead, messages])


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

  return {
    scrollRef,
    sentinelRef,
    isFollowing,
    scrollFollowToBottom,
    beginProgrammaticScroll,
    endProgrammaticScroll,
    showScrollButton,
    transcriptPaddingBottom,
    initialReadAnchorMessageId,
    initialReadAnchorBlockIndex,
    handleInitialReadAnchorScrolled,
    scrollToBottom,
    keepComposerSubmitAnchored,
    initialScrollCompletedRef,
    scrollModeRef,
  }
}
