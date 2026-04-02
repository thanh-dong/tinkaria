import { describe, expect, test } from "bun:test"

describe("tinkaria naming", () => {
  test("exports the renamed app shell modules", async () => {
    const sidebar = await import("./TinkariaSidebar")
    const transcript = await import("./TinkariaTranscript")
    const state = await import("./useTinkariaState")

    expect(typeof sidebar.TinkariaSidebar).toBe("function")
    expect(typeof transcript.TinkariaTranscript).toBe("function")
    expect(typeof state.useTinkariaState).toBe("function")
  })
})
