import { describe, test, expect } from "bun:test"

describe("WorkspacePage", () => {
  test("exports WorkspacePage component", async () => {
    const mod = await import("./WorkspacePage")
    expect(typeof mod.WorkspacePage).toBe("function")
  })
})
