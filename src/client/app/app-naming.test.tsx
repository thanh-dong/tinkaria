import { describe, expect, test } from "bun:test"

describe("app naming", () => {
  test("exports the renamed app shell modules", async () => {
    const sidebar = await import("./AppSidebar")
    const transcript = await import("./ChatTranscript")
    const state = await import("./useAppState")

    expect(sidebar.AppSidebar).toBeTruthy()
    expect(typeof transcript.ChatTranscript).toBe("function")
    expect(typeof state.useAppState).toBe("function")
  })
})
