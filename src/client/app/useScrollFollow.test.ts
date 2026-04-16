import { describe, expect, test } from "bun:test"

describe("useScrollFollow", () => {
  test("module exports useScrollFollow hook and re-exports from scrollFollowStore", async () => {
    const mod = await import("./useScrollFollow")
    expect(typeof mod.useScrollFollow).toBe("function")
    expect(typeof mod.isWithinBottomFollowBand).toBe("function")
  })
})
