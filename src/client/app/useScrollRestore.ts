import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { isWithinBottomFollowBand } from "./scrollFollowStore"
import type { TranscriptRenderUnit } from "../../shared/types"
import type { CachedScrollState } from "./useTranscriptLifecycle"

export type AnchoringPhase = "idle" | "pre-paint-done" | "stabilizing" | "complete"

export function useScrollRestore(args: {
  activeChatId: string | null
  scrollRef: RefObject<HTMLElement | null>
  messages: TranscriptRenderUnit[]
  cachedScrollState: CachedScrollState | null
  onChatChanged: () => void
  onInitialScrollDone: (anchor: "tail" | "block") => void
  beginProgrammaticScroll: () => void
  endProgrammaticScroll: () => void
}): { phaseRef: RefObject<AnchoringPhase> } {
  const {
    activeChatId,
    scrollRef,
    messages,
    cachedScrollState,
    onChatChanged,
    onInitialScrollDone,
    beginProgrammaticScroll,
    endProgrammaticScroll,
  } = args

  const phaseRef = useRef<AnchoringPhase>("idle")
  // Stable ref for cachedScrollState so the layout effect can read it without re-triggering
  const cachedScrollStateRef = useRef(cachedScrollState)
  cachedScrollStateRef.current = cachedScrollState

  // ── Pre-paint restore (synchronous, before browser paints) ──
  useLayoutEffect(() => {
    phaseRef.current = "idle"
    onChatChanged()

    const element = scrollRef.current
    if (!element) return

    const cached = cachedScrollStateRef.current
    if (cached && cached.scrollMode === "detached") {
      // Restore exact cached position — skip stabilization entirely
      beginProgrammaticScroll()
      element.scrollTop = cached.scrollTop
      endProgrammaticScroll()
      phaseRef.current = "complete"
      onInitialScrollDone("block")
    } else if (messages.length > 0) {
      // Default: scroll to bottom synchronously (before paint)
      beginProgrammaticScroll()
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
      endProgrammaticScroll()
      phaseRef.current = "pre-paint-done"
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])

  // ── Post-paint stabilization (wait for virtualizer heights to settle) ──
  useEffect(() => {
    if (phaseRef.current !== "pre-paint-done") return
    if (messages.length === 0) return
    const element = scrollRef.current
    if (!element) return

    phaseRef.current = "stabilizing"
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
        phaseRef.current = "complete"
        onInitialScrollDone("tail")
        endProgrammaticScroll()
      }
    }, 50)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      if (phaseRef.current !== "complete") {
        phaseRef.current = "complete"
        onInitialScrollDone("tail")
        endProgrammaticScroll()
      }
    }, 2000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      endProgrammaticScroll()
    }
  }, [activeChatId, beginProgrammaticScroll, endProgrammaticScroll, onInitialScrollDone, messages.length])

  return { phaseRef }
}
