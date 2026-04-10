import { describe, test, expect } from "bun:test"
import { deriveProjectCoordinationSnapshot } from "./read-models"
import { createEmptyState, createEmptyCoordinationState } from "./events"

describe("deriveProjectCoordinationSnapshot", () => {
  test("returns empty snapshot for unknown project", () => {
    const state = createEmptyState()
    const snapshot = deriveProjectCoordinationSnapshot(state, "unknown-proj")
    expect(snapshot).toEqual({
      projectId: "unknown-proj",
      todos: [],
      claims: [],
      worktrees: [],
      rules: [],
      lastUpdated: expect.any(String),
    })
  })

  test("returns todos sorted by updatedAt desc", () => {
    const state = createEmptyState()
    const coord = createEmptyCoordinationState()
    coord.todos.set("t-1", {
      id: "t-1", description: "First", priority: "normal", status: "open",
      claimedBy: null, outputs: [], createdBy: "s-1",
      createdAt: "2026-04-10T00:00:00.000Z", updatedAt: "2026-04-10T00:00:00.000Z",
    })
    coord.todos.set("t-2", {
      id: "t-2", description: "Second", priority: "high", status: "claimed",
      claimedBy: "s-2", outputs: [], createdBy: "s-1",
      createdAt: "2026-04-10T01:00:00.000Z", updatedAt: "2026-04-10T01:00:00.000Z",
    })
    coord.lastUpdated = "2026-04-10T01:00:00.000Z"
    state.coordinationByProject.set("proj-1", coord)

    const snapshot = deriveProjectCoordinationSnapshot(state, "proj-1")
    expect(snapshot.todos).toHaveLength(2)
    expect(snapshot.todos[0].id).toBe("t-2")
    expect(snapshot.lastUpdated).toBe("2026-04-10T01:00:00.000Z")
  })

  test("filters out released claims and removed worktrees", () => {
    const state = createEmptyState()
    const coord = createEmptyCoordinationState()
    coord.claims.set("c-1", {
      id: "c-1", intent: "active", files: ["a.ts"], sessionId: "s-1",
      status: "active", conflictsWith: null, createdAt: "2026-04-10T00:00:00.000Z",
    })
    coord.claims.set("c-2", {
      id: "c-2", intent: "released", files: ["b.ts"], sessionId: "s-2",
      status: "released", conflictsWith: null, createdAt: "2026-04-10T00:00:00.000Z",
    })
    coord.worktrees.set("wt-1", {
      id: "wt-1", branch: "main", baseBranch: "main", path: "/tmp/wt",
      assignedTo: null, status: "ready", createdAt: "2026-04-10T00:00:00.000Z",
    })
    coord.worktrees.set("wt-2", {
      id: "wt-2", branch: "old", baseBranch: "main", path: "/tmp/wt2",
      assignedTo: null, status: "removed", createdAt: "2026-04-10T00:00:00.000Z",
    })
    coord.lastUpdated = "2026-04-10T00:00:00.000Z"
    state.coordinationByProject.set("proj-1", coord)

    const snapshot = deriveProjectCoordinationSnapshot(state, "proj-1")
    expect(snapshot.claims).toHaveLength(1)
    expect(snapshot.claims[0].id).toBe("c-1")
    expect(snapshot.worktrees).toHaveLength(1)
    expect(snapshot.worktrees[0].id).toBe("wt-1")
  })
})
