import { describe, expect, test } from "bun:test"

describe("useScrollAutoFollow", () => {
  test("module exports useScrollAutoFollow function", async () => {
    const mod = await import("./useScrollAutoFollow")
    expect(typeof mod.useScrollAutoFollow).toBe("function")
  })
})
