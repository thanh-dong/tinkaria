import { useCallback, useRef, useSyncExternalStore } from "react"
import { nextScrollMode, shouldAutoFollow, type ScrollMode } from "./scrollMachine"
import type { RefObject } from "react"

export interface ScrollFollowStore {
  getSnapshot: () => boolean
  getMode: () => ScrollMode
  subscribe: (onChange: () => void) => () => void
  handleInitialScrollDone: (anchor: "tail" | "block") => void
  handleScrollToBottom: () => void
  handleChatChanged: () => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
  destroy: () => void
}

const BOTTOM_FOLLOW_DISTANCE_RATIO = 0.02

function isScrolledToBottom(element: HTMLElement): boolean {
  const bottomGap = element.scrollHeight - element.scrollTop - element.clientHeight
  const followBand = Math.max(2, element.clientHeight * BOTTOM_FOLLOW_DISTANCE_RATIO)
  return bottomGap <= followBand
}

export function createScrollFollowStore(
  scrollEl: HTMLElement,
  sentinelEl: HTMLElement,
): ScrollFollowStore {
  let mode: ScrollMode = "anchoring"
  let isFollowing = false
  let isProgrammatic = false
  let listener: (() => void) | null = null

  function transition(event: Parameters<typeof nextScrollMode>[1]) {
    const prev = mode
    mode = nextScrollMode(prev, event)
    isFollowing = shouldAutoFollow(mode)
    if (mode !== prev) {
      listener?.()
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (!entry) return
      transition({
        type: "intersection-change",
        isIntersecting: entry.isIntersecting,
        isProgrammatic,
      })
    },
    { root: scrollEl, threshold: 0 },
  )
  observer.observe(sentinelEl)

  function handleScroll() {
    if (!isScrolledToBottom(scrollEl)) return
    transition({
      type: "intersection-change",
      isIntersecting: true,
      isProgrammatic,
    })
  }

  scrollEl.addEventListener("scroll", handleScroll, { passive: true })

  return {
    getSnapshot: () => isFollowing,
    getMode: () => mode,

    subscribe(onChange) {
      listener = onChange
      return () => { listener = null }
    },

    handleInitialScrollDone(anchor) {
      transition({ type: "initial-scroll-done", anchor })
      // Force re-observe so the observer delivers current intersection state.
      // Without this, a "block" anchor that lands with the sentinel already
      // visible stays "detached" forever — the observer already fired during
      // "anchoring" (which ignores intersection events) and won't fire again.
      observer.unobserve(sentinelEl)
      observer.observe(sentinelEl)
    },

    handleScrollToBottom() {
      transition({ type: "scroll-to-bottom" })
    },

    handleChatChanged() {
      transition({ type: "chat-changed" })
    },

    beginProgrammaticScroll() { isProgrammatic = true },
    endProgrammaticScroll() { isProgrammatic = false },

    destroy() {
      observer.disconnect()
      scrollEl.removeEventListener("scroll", handleScroll)
      listener = null
    },
  }
}

export function useScrollFollow(
  scrollRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
): {
  isFollowing: boolean
  modeRef: RefObject<ScrollMode>
  scrollToBottom: (behavior?: ScrollBehavior) => void
  handleInitialScrollDone: (anchor: "tail" | "block") => void
  handleChatChanged: () => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
} {
  const storeRef = useRef<ScrollFollowStore | null>(null)
  const modeRef = useRef<ScrollMode>("anchoring")
  const rafRef = useRef<number | null>(null)

  // Refs are identity-stable across renders, so these callbacks only
  // recreate when the ref objects themselves change (effectively never).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function getStore(): ScrollFollowStore | null {
    const scrollEl = scrollRef.current
    const sentinelEl = sentinelRef.current
    if (!scrollEl || !sentinelEl) return null
    if (!storeRef.current) {
      storeRef.current = createScrollFollowStore(scrollEl, sentinelEl)
    }
    return storeRef.current
  }

  const subscribe = useCallback((onChange: () => void) => {
    const store = getStore()
    if (!store) return () => {}
    const unsubscribe = store.subscribe(() => {
      modeRef.current = store.getMode()
      onChange()
    })
    return () => {
      unsubscribe()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      storeRef.current?.destroy()
      storeRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const getSnapshot = useCallback(() => {
    const store = getStore()
    if (!store) return false
    modeRef.current = store.getMode()
    return store.getSnapshot()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const isFollowing = useSyncExternalStore(subscribe, getSnapshot, () => false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const store = getStore()
    const element = scrollRef.current
    if (!store || !element) return
    store.beginProgrammaticScroll()
    store.handleScrollToBottom()
    modeRef.current = store.getMode()
    element.scrollTo({ top: element.scrollHeight, behavior })
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      store.endProgrammaticScroll()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef])

  const handleInitialScrollDone = useCallback((anchor: "tail" | "block") => {
    const store = getStore()
    if (!store) return
    store.handleInitialScrollDone(anchor)
    modeRef.current = store.getMode()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const handleChatChanged = useCallback(() => {
    const store = getStore()
    if (!store) return
    store.handleChatChanged()
    modeRef.current = store.getMode()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const beginProgrammaticScroll = useCallback(() => {
    getStore()?.beginProgrammaticScroll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const endProgrammaticScroll = useCallback(() => {
    getStore()?.endProgrammaticScroll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  return {
    isFollowing,
    modeRef,
    scrollToBottom,
    handleInitialScrollDone,
    handleChatChanged,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  }
}
