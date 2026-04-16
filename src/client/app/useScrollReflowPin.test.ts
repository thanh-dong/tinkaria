import { describe, expect, test } from "bun:test"
import { shouldReconcileDetachedScrollMode } from "./useScrollReflowPin"

describe("shouldReconcileDetachedScrollMode", () => {
  test("returns true when detached mode is already back at the bottom follow band", () => {
    expect(shouldReconcileDetachedScrollMode({
      anchoringPhase: "complete",
      scrollMode: "detached",
      scrollHeight: 1000,
      scrollTop: 592,
      clientHeight: 400,
    })).toBe(true)
  })

  test("returns false before the initial transcript anchoring completes", () => {
    expect(shouldReconcileDetachedScrollMode({
      anchoringPhase: "stabilizing",
      scrollMode: "detached",
      scrollHeight: 1000,
      scrollTop: 600,
      clientHeight: 400,
    })).toBe(false)
  })

  test("returns false when idle phase", () => {
    expect(shouldReconcileDetachedScrollMode({
      anchoringPhase: "idle",
      scrollMode: "detached",
      scrollHeight: 1000,
      scrollTop: 600,
      clientHeight: 400,
    })).toBe(false)
  })

  test("returns false when the transcript is still meaningfully above the bottom", () => {
    expect(shouldReconcileDetachedScrollMode({
      anchoringPhase: "complete",
      scrollMode: "detached",
      scrollHeight: 1000,
      scrollTop: 560,
      clientHeight: 400,
    })).toBe(false)
  })

  test("returns false when already following", () => {
    expect(shouldReconcileDetachedScrollMode({
      anchoringPhase: "complete",
      scrollMode: "following",
      scrollHeight: 1000,
      scrollTop: 600,
      clientHeight: 400,
    })).toBe(false)
  })
})
