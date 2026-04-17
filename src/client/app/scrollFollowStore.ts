import { nextScrollMode, type ScrollMode } from "./scrollMachine"
import { createScrollDetector, type ScrollDetector } from "./scrollDetection"

export interface ScrollFollowStore {
  getSnapshot: () => ScrollMode
  subscribe: (onChange: () => void) => () => void
  handleInitialScrollDone: (anchor: "tail" | "block") => void
  handleScrollToBottom: () => void
  handleChatChanged: () => void
  scrollToBottom: (behavior: ScrollBehavior) => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
  destroy: () => void
}

const BOTTOM_FOLLOW_DISTANCE_RATIO = 0.02
export const SMOOTH_SCROLL_TIMEOUT_MS = 500

export function isWithinBottomFollowBand(bottomGap: number, clientHeight: number): boolean {
  const followBand = Math.max(2, clientHeight * BOTTOM_FOLLOW_DISTANCE_RATIO)
  return bottomGap <= followBand
}

export function createScrollFollowStore(
  scrollEl: HTMLElement,
  sentinelEl: HTMLElement,
): ScrollFollowStore {
  let mode: ScrollMode = "anchoring"
  let programmaticDepth = 0
  let listener: (() => void) | null = null
  let pendingSmoothResolve = false
  let smoothTimeout: ReturnType<typeof setTimeout> | null = null

  function transition(event: Parameters<typeof nextScrollMode>[1]) {
    const prev = mode
    mode = nextScrollMode(prev, event)
    if (mode !== prev) {
      listener?.()
    }
  }

  function clearSmoothGuard() {
    if (!pendingSmoothResolve) return
    pendingSmoothResolve = false
    if (smoothTimeout !== null) {
      clearTimeout(smoothTimeout)
      smoothTimeout = null
    }
    programmaticDepth = Math.max(0, programmaticDepth - 1)
  }

  const detector: ScrollDetector = createScrollDetector({
    scrollEl,
    sentinelEl,
    onIntersectionChange(isIntersecting) {
      // If smooth scroll is pending and sentinel arrives, clear the guard
      if (isIntersecting && pendingSmoothResolve) {
        clearSmoothGuard()
      }
      transition({
        type: "intersection-change",
        isIntersecting,
        isProgrammatic: programmaticDepth > 0,
      })
    },
  })

  return {
    getSnapshot: () => mode,

    subscribe(onChange) {
      listener = onChange
      return () => { listener = null }
    },

    handleInitialScrollDone(anchor) {
      transition({ type: "initial-scroll-done", anchor })
      detector.reobserve()
    },

    handleScrollToBottom() {
      transition({ type: "scroll-to-bottom" })
    },

    handleChatChanged() {
      transition({ type: "chat-changed" })
    },

    scrollToBottom(behavior: ScrollBehavior) {
      programmaticDepth++
      transition({ type: "scroll-to-bottom" })
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior })

      if (behavior === "auto") {
        // Instant scroll — decrement synchronously
        programmaticDepth = Math.max(0, programmaticDepth - 1)
      } else {
        // Smooth scroll — keep guard until IO confirms arrival or timeout
        pendingSmoothResolve = true
        smoothTimeout = setTimeout(() => {
          clearSmoothGuard()
        }, SMOOTH_SCROLL_TIMEOUT_MS)
      }
    },

    beginProgrammaticScroll() { programmaticDepth++ },
    endProgrammaticScroll() { programmaticDepth = Math.max(0, programmaticDepth - 1) },

    destroy() {
      if (smoothTimeout !== null) clearTimeout(smoothTimeout)
      detector.destroy()
      listener = null
    },
  }
}
