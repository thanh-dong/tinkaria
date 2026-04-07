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
    return "anchoring"
  }

  if (event.type === "scroll-to-bottom") return "following"

  if (event.type === "intersection-change") {
    if (event.isIntersecting) return "following"
    if (event.isProgrammatic) return current
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
