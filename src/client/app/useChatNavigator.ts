import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { TranscriptRenderUnit } from "../../shared/types"
import type { ChatVirtualizer } from "./ChatTranscript"
import { extractWaypoints, findCurrentWaypointIndex } from "./chatWaypoints"
import { SMOOTH_SCROLL_TIMEOUT_MS } from "./scrollFollowStore"

export interface ChatNavigatorState {
  currentIndex: number
  totalCount: number
  currentLabel: string
  goNext: () => void
  goPrev: () => void
}

export function useChatNavigator({
  messages,
  scrollRef,
  virtualizerRef,
  scrollToBottom,
  beginProgrammaticScroll,
  endProgrammaticScroll,
}: {
  messages: TranscriptRenderUnit[]
  scrollRef: RefObject<HTMLDivElement | null>
  virtualizerRef: RefObject<ChatVirtualizer | null>
  scrollToBottom: () => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
}): ChatNavigatorState {
  const waypoints = useMemo(() => extractWaypoints(messages), [messages])
  const waypointsRef = useRef(waypoints)
  waypointsRef.current = waypoints
  const [currentIndex, setCurrentIndex] = useState(-1)
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex

  function recomputeIndex() {
    const el = scrollRef.current
    const virt = virtualizerRef.current
    if (!el || !virt) return
    const idx = findCurrentWaypointIndex(
      waypointsRef.current,
      el.scrollTop,
      (wp) => virt.measurementsCache[wp.renderIndex]?.start ?? null,
    )
    if (idx !== currentIndexRef.current) setCurrentIndex(idx)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let ticking = false
    let rafId = 0

    function onScroll() {
      if (ticking) return
      ticking = true
      rafId = requestAnimationFrame(() => {
        ticking = false
        recomputeIndex()
      })
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(rafId)
    }
  }, [scrollRef, virtualizerRef])

  // Recompute when waypoints change (new user prompt added) without reattaching listener
  useEffect(() => { recomputeIndex() }, [waypoints])

  function guardedSmoothScroll(action: () => void) {
    beginProgrammaticScroll()
    action()
    requestAnimationFrame(() => {
      setTimeout(() => endProgrammaticScroll(), SMOOTH_SCROLL_TIMEOUT_MS)
    })
  }

  const goNext = useCallback(() => {
    const virt = virtualizerRef.current
    const wps = waypointsRef.current
    if (!virt || wps.length === 0) return

    const nextIdx = currentIndexRef.current + 1
    if (nextIdx >= wps.length) {
      scrollToBottom()
      return
    }

    guardedSmoothScroll(() => virt.scrollToIndex(wps[nextIdx].renderIndex, { align: "start", behavior: "smooth" }))
  }, [virtualizerRef, scrollToBottom, beginProgrammaticScroll, endProgrammaticScroll])

  const goPrev = useCallback(() => {
    const el = scrollRef.current
    const virt = virtualizerRef.current
    const wps = waypointsRef.current
    if (!el || !virt || wps.length === 0) return

    const prevIdx = currentIndexRef.current - 1
    if (prevIdx < 0) {
      guardedSmoothScroll(() => el.scrollTo({ top: 0, behavior: "smooth" }))
      return
    }

    guardedSmoothScroll(() => virt.scrollToIndex(wps[prevIdx].renderIndex, { align: "start", behavior: "smooth" }))
  }, [scrollRef, virtualizerRef, beginProgrammaticScroll, endProgrammaticScroll])

  const currentLabel = currentIndex >= 0 && currentIndex < waypoints.length
    ? waypoints[currentIndex].label
    : waypoints.length > 0 ? waypoints[0].label : ""

  return {
    currentIndex,
    totalCount: waypoints.length,
    currentLabel,
    goNext,
    goPrev,
  }
}
