import { describe, expect, test } from "bun:test"
import {
  nextScrollMode,
  shouldShowScrollButton,
  shouldAutoFollow,
  type ScrollMode,
} from "./scrollMachine"

describe("nextScrollMode", () => {
  describe("from anchoring", () => {
    const current: ScrollMode = "anchoring"

    test("transitions to following when initial scroll to tail completes", () => {
      expect(nextScrollMode(current, { type: "initial-scroll-done", anchor: "tail" })).toBe("following")
    })

    test("transitions to detached when initial scroll to block anchor completes", () => {
      expect(nextScrollMode(current, { type: "initial-scroll-done", anchor: "block" })).toBe("detached")
    })

    test("ignores programmatic intersection changes during anchoring", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: false,
        isProgrammatic: true,
      })).toBe("anchoring")
    })

    test("breaks out to detached on user scroll during anchoring", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: false,
        isProgrammatic: false,
      })).toBe("detached")
    })

    test("stays anchoring when sentinel is visible from user context during anchoring", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: true,
        isProgrammatic: false,
      })).toBe("anchoring")
    })

    test("ignores scroll-to-bottom during anchoring", () => {
      expect(nextScrollMode(current, { type: "scroll-to-bottom" })).toBe("anchoring")
    })

    test("resets to anchoring on chat change", () => {
      expect(nextScrollMode(current, { type: "chat-changed" })).toBe("anchoring")
    })
  })

  describe("from following", () => {
    const current: ScrollMode = "following"

    test("transitions to detached when sentinel exits viewport from user scroll", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: false,
        isProgrammatic: false,
      })).toBe("detached")
    })

    test("stays following when sentinel exits during programmatic scroll", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: false,
        isProgrammatic: true,
      })).toBe("following")
    })

    test("stays following when sentinel enters viewport", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: true,
        isProgrammatic: false,
      })).toBe("following")
    })

    test("resets to anchoring on chat change", () => {
      expect(nextScrollMode(current, { type: "chat-changed" })).toBe("anchoring")
    })

    test("stays following on scroll-to-bottom", () => {
      expect(nextScrollMode(current, { type: "scroll-to-bottom" })).toBe("following")
    })
  })

  describe("from detached", () => {
    const current: ScrollMode = "detached"

    test("transitions to following when sentinel enters viewport from user scroll", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: true,
        isProgrammatic: false,
      })).toBe("following")
    })

    test("transitions to following on scroll-to-bottom click", () => {
      expect(nextScrollMode(current, { type: "scroll-to-bottom" })).toBe("following")
    })

    test("stays detached when sentinel exits viewport", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: false,
        isProgrammatic: false,
      })).toBe("detached")
    })

    test("resets to anchoring on chat change", () => {
      expect(nextScrollMode(current, { type: "chat-changed" })).toBe("anchoring")
    })

    test("stays detached when sentinel enters during programmatic scroll (navigator waypoint scroll)", () => {
      expect(nextScrollMode(current, {
        type: "intersection-change",
        isIntersecting: true,
        isProgrammatic: true,
      })).toBe("detached")
    })
  })
})

describe("shouldShowScrollButton", () => {
  test("shows button when detached with messages", () => {
    expect(shouldShowScrollButton("detached", 5)).toBe(true)
  })

  test("hides button when detached with no messages", () => {
    expect(shouldShowScrollButton("detached", 0)).toBe(false)
  })

  test("hides button when following", () => {
    expect(shouldShowScrollButton("following", 5)).toBe(false)
  })

  test("hides button when anchoring", () => {
    expect(shouldShowScrollButton("anchoring", 5)).toBe(false)
  })
})

describe("shouldAutoFollow", () => {
  test("returns true when following", () => {
    expect(shouldAutoFollow("following")).toBe(true)
  })

  test("returns false when detached", () => {
    expect(shouldAutoFollow("detached")).toBe(false)
  })

  test("returns false when anchoring", () => {
    expect(shouldAutoFollow("anchoring")).toBe(false)
  })
})
