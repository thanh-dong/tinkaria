import { describe, expect, test } from "bun:test"
import type { AnchoringPhase } from "./useScrollRestore"

describe("useScrollRestore — AnchoringPhase type", () => {
  test("phase values are valid string literals", () => {
    const phases: AnchoringPhase[] = ["idle", "pre-paint-done", "stabilizing", "complete"]
    expect(phases).toHaveLength(4)
    // Verify each is a distinct value
    expect(new Set(phases).size).toBe(4)
  })

  test("phase ordering: idle → pre-paint-done → stabilizing → complete", () => {
    // Document the intended progression
    const order: AnchoringPhase[] = ["idle", "pre-paint-done", "stabilizing", "complete"]
    expect(order[0]).toBe("idle")
    expect(order[1]).toBe("pre-paint-done")
    expect(order[2]).toBe("stabilizing")
    expect(order[3]).toBe("complete")
  })
})
