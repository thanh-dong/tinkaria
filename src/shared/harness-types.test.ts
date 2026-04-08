import { describe, test, expect } from "bun:test"

describe("shared harness-types", () => {
  test("HarnessEvent type and HarnessTurn type are exportable from shared", async () => {
    // Dynamic import to test module resolution
    const mod = await import("./harness-types")
    // Module should export these (even if type-only, the module must resolve)
    expect(mod).toBeDefined()
  })

  test("server re-export still resolves", async () => {
    const mod = await import("../server/harness-types")
    expect(mod).toBeDefined()
  })
})
