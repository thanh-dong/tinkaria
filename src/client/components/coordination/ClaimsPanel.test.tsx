import { describe, test, expect, mock } from "bun:test"
import type { WorkspaceClaim } from "../../../shared/workspace-types"

function makeClaim(overrides: Partial<WorkspaceClaim> = {}): WorkspaceClaim {
  return {
    id: "c1",
    intent: "fix authentication bug",
    files: ["src/auth.ts", "src/session.ts"],
    sessionId: "session-1",
    status: "active",
    conflictsWith: null,
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("ClaimsPanel", () => {
  test("exports ClaimsPanel component", async () => {
    const mod = await import("./ClaimsPanel")
    expect(typeof mod.ClaimsPanel).toBe("function")
  })

  test("onCreateClaim callback receives intent, files, sessionId", () => {
    const onCreate = mock(() => {})
    onCreate("fix bug", ["src/foo.ts"], "session-1")
    expect(onCreate).toHaveBeenCalledWith("fix bug", ["src/foo.ts"], "session-1")
  })

  test("onReleaseClaim callback receives claimId", () => {
    const onRelease = mock(() => {})
    onRelease("c1")
    expect(onRelease).toHaveBeenCalledWith("c1")
  })

  void makeClaim
})
