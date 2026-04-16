import { useLayoutEffect, type RefObject } from "react"
import type { ScrollMode } from "./scrollMachine"
import type { AnchoringPhase } from "./useScrollRestore"

export function useScrollAutoFollow(args: {
  scrollRef: RefObject<HTMLElement | null>
  anchoringPhase: RefObject<AnchoringPhase>
  scrollModeRef: RefObject<ScrollMode>
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
  messageCount: number
  runtimeStatus: string | undefined
  inputHeight: number
}): void {
  const {
    scrollRef,
    anchoringPhase,
    scrollModeRef,
    beginProgrammaticScroll,
    endProgrammaticScroll,
    messageCount,
    runtimeStatus,
    inputHeight,
  } = args

  // Auto-scroll to bottom when following mode and content changes.
  // useLayoutEffect to prevent visual flash — runs before paint.
  useLayoutEffect(() => {
    if (anchoringPhase.current !== "complete") return
    const element = scrollRef.current
    if (!element) return

    if (scrollModeRef.current !== "following") return

    beginProgrammaticScroll()
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    const frameId = window.requestAnimationFrame(() => endProgrammaticScroll())
    return () => {
      window.cancelAnimationFrame(frameId)
      endProgrammaticScroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginProgrammaticScroll, endProgrammaticScroll, inputHeight, messageCount, runtimeStatus])
}
