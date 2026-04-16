import { useCallback, useEffect, useRef, useState } from "react"
import { shouldAutoFollow, type ScrollMode } from "./scrollMachine"
import { createScrollFollowStore, type ScrollFollowStore } from "./scrollFollowStore"
import type { RefObject } from "react"

// Re-export for existing consumers
export { isWithinBottomFollowBand, type ScrollFollowStore } from "./scrollFollowStore"

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
  const [scrollMode, setScrollMode] = useState<ScrollMode>("anchoring")

  function getStore(): ScrollFollowStore | null {
    const scrollEl = scrollRef.current
    const sentinelEl = sentinelRef.current
    if (!scrollEl || !sentinelEl) return null
    if (!storeRef.current) {
      storeRef.current = createScrollFollowStore(scrollEl, sentinelEl)
    }
    return storeRef.current
  }

  useEffect(() => {
    const store = getStore()
    if (!store) return
    const unsubscribe = store.subscribe(() => {
      const mode = store.getSnapshot()
      modeRef.current = mode
      setScrollMode(mode)
    })
    modeRef.current = store.getSnapshot()
    setScrollMode(store.getSnapshot())

    return () => {
      unsubscribe()
      storeRef.current?.destroy()
      storeRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef.current, sentinelRef.current])

  const isFollowing = shouldAutoFollow(scrollMode)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const store = getStore()
    if (!store) return
    store.scrollToBottom(behavior)
    modeRef.current = store.getSnapshot()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const handleInitialScrollDone = useCallback((anchor: "tail" | "block") => {
    const store = getStore()
    if (!store) return
    store.handleInitialScrollDone(anchor)
    modeRef.current = store.getSnapshot()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, sentinelRef])

  const handleChatChanged = useCallback(() => {
    const store = getStore()
    if (!store) return
    store.handleChatChanged()
    modeRef.current = store.getSnapshot()
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
