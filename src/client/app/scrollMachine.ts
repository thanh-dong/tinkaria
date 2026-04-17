export type ScrollMode = "following" | "detached" | "anchoring"

export type ScrollEvent =
  | { type: "intersection-change"; isIntersecting: boolean; isProgrammatic: boolean }
  | { type: "initial-scroll-done"; anchor: "tail" | "block" }
  | { type: "scroll-to-bottom" }
  | { type: "chat-changed" }

export function nextScrollMode(current: ScrollMode, event: ScrollEvent): ScrollMode {
  if (event.type === "chat-changed") return "anchoring"

  if (current === "anchoring") {
    if (event.type === "initial-scroll-done") {
      return event.anchor === "tail" ? "following" : "detached"
    }
    // User scrolled away from bottom before initial scroll completed — break out of anchoring
    if (event.type === "intersection-change" && !event.isProgrammatic && !event.isIntersecting) {
      return "detached"
    }
    return "anchoring"
  }

  if (event.type === "scroll-to-bottom") return "following"

  if (event.type === "intersection-change") {
    if (event.isProgrammatic) return current
    if (event.isIntersecting) return "following"
    return "detached"
  }

  return current
}

export function shouldShowScrollButton(mode: ScrollMode, messageCount: number): boolean {
  return mode === "detached" && messageCount > 0
}

export function shouldAutoFollow(mode: ScrollMode): boolean {
  return mode === "following"
}
