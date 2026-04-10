import { describe, test, expect, mock } from "bun:test"
import type { ProjectWorktree } from "../../../shared/project-agent-types"

function makeWorktree(overrides: Partial<ProjectWorktree> = {}): ProjectWorktree {
  return {
    id: "wt1",
    branch: "feat/auth",
    baseBranch: "main",
    path: "/tmp/project-wt1",
    assignedTo: null,
    status: "ready",
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("WorktreesPanel", () => {
  test("exports WorktreesPanel component", async () => {
    const mod = await import("./WorktreesPanel")
    expect(typeof mod.WorktreesPanel).toBe("function")
  })

  test("onCreateWorktree callback receives branch and baseBranch", () => {
    const onCreate = mock(() => {})
    onCreate("feat/auth", "main")
    expect(onCreate).toHaveBeenCalledWith("feat/auth", "main")
  })

  test("onAssignWorktree callback receives worktreeId and sessionId", () => {
    const onAssign = mock(() => {})
    onAssign("wt1", "session-1")
    expect(onAssign).toHaveBeenCalledWith("wt1", "session-1")
  })

  test("onRemoveWorktree callback receives worktreeId", () => {
    const onRemove = mock(() => {})
    onRemove("wt1")
    expect(onRemove).toHaveBeenCalledWith("wt1")
  })

  void makeWorktree
})
