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
    const nowFollowing = shouldAutoFollow(mode)
    if (nowFollowing !== isFollowing) {
      isFollowing = nowFollowing
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

  return {
    getSnapshot: () => isFollowing,
    getMode: () => mode,

    subscribe(onChange) {
      listener = onChange
      return () => { listener = null }
    },

    handleInitialScrollDone(anchor) {
      transition({ type: "initial-scroll-done", anchor })
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

  return {
    isFollowing,
    modeRef,
    scrollToBottom,
    handleInitialScrollDone,
    handleChatChanged,
  }
}
