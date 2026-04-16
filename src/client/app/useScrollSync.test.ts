import { describe, expect, test } from "bun:test"

describe("useScrollSync", () => {
  test("module exports useScrollSync function", async () => {
    const mod = await import("./useScrollSync")
    expect(typeof mod.useScrollSync).toBe("function")
  })
})
