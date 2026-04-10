import { describe, test, expect } from "bun:test"

describe("ProjectPage", () => {
  test("exports ProjectPage component", async () => {
    const mod = await import("./ProjectPage")
    expect(typeof mod.ProjectPage).toBe("function")
  })
})
