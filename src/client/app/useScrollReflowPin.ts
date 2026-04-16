import { useEffect, type RefObject } from "react"
import type { ScrollMode } from "./scrollMachine"
import type { AnchoringPhase } from "./useScrollRestore"
import { isWithinBottomFollowBand } from "./scrollFollowStore"

export function shouldReconcileDetachedScrollMode(args: {
  anchoringPhase: AnchoringPhase
  scrollMode: ScrollMode
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): boolean {
  if (args.anchoringPhase !== "complete") return false
  if (args.scrollMode !== "detached") return false
  const bottomGap = args.scrollHeight - args.scrollTop - args.clientHeight
  return isWithinBottomFollowBand(bottomGap, args.clientHeight)
}

export function useScrollReflowPin(args: {
  activeChatId: string | null
  scrollRef: RefObject<HTMLElement | null>
  anchoringPhase: RefObject<AnchoringPhase>
  scrollModeRef: RefObject<ScrollMode>
  scrollFollowToBottom: (behavior?: ScrollBehavior) => void
}): void {
  const {
    activeChatId,
    scrollRef,
    anchoringPhase,
    scrollModeRef,
    scrollFollowToBottom,
  } = args

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !activeChatId) return

    const scrollElement = element
    const resizeTarget = scrollElement.firstElementChild instanceof HTMLElement
      ? scrollElement.firstElementChild
      : scrollElement

    function keepFollowPinnedOnResize() {
      if (anchoringPhase.current !== "complete") return

      if (scrollModeRef.current === "following") {
        scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: "auto" })
        return
      }

      if (!shouldReconcileDetachedScrollMode({
        anchoringPhase: anchoringPhase.current,
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
  }, [activeChatId, scrollFollowToBottom, scrollModeRef, anchoringPhase, scrollRef])
}
