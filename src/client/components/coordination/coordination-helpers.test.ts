import { describe, test, expect } from "bun:test"
import {
  filterTodos,
  formatRelativeTimestamp,
  prioritySortOrder,
  isClaimConflicting,
} from "./coordination-helpers"
import type { WorkspaceTodo, WorkspaceClaim } from "../../../shared/workspace-types"

function makeTodo(overrides: Partial<WorkspaceTodo> = {}): WorkspaceTodo {
  return {
    id: "t1",
    description: "Test todo",
    priority: "normal",
    status: "open",
    claimedBy: null,
    outputs: [],
    createdBy: "session-1",
    createdAt: "2026-04-11T00:00:00Z",
    updatedAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

function makeClaim(overrides: Partial<WorkspaceClaim> = {}): WorkspaceClaim {
  return {
    id: "c1",
    intent: "fix bug",
    files: ["src/foo.ts"],
    sessionId: "session-1",
    status: "active",
    conflictsWith: null,
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("filterTodos", () => {
  test("returns all todos when filter is 'all'", () => {
    const todos = [
      makeTodo({ status: "open" }),
      makeTodo({ id: "t2", status: "complete" }),
      makeTodo({ id: "t3", status: "claimed" }),
    ]
    expect(filterTodos(todos, "all")).toHaveLength(3)
  })

  test("filters by status", () => {
    const todos = [
      makeTodo({ status: "open" }),
      makeTodo({ id: "t2", status: "complete" }),
      makeTodo({ id: "t3", status: "claimed" }),
    ]
    expect(filterTodos(todos, "open")).toEqual([todos[0]])
    expect(filterTodos(todos, "complete")).toEqual([todos[1]])
  })
})

describe("prioritySortOrder", () => {
  test("returns numeric order: high=0, normal=1, low=2", () => {
    expect(prioritySortOrder("high")).toBe(0)
    expect(prioritySortOrder("normal")).toBe(1)
    expect(prioritySortOrder("low")).toBe(2)
  })
})

describe("formatRelativeTimestamp", () => {
  test("returns a non-empty string for valid ISO timestamp", () => {
    const result = formatRelativeTimestamp("2026-04-11T00:00:00Z")
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })
})

describe("isClaimConflicting", () => {
  test("returns true when conflictsWith is set", () => {
    expect(isClaimConflicting(makeClaim({ conflictsWith: "c2" }))).toBe(true)
  })

  test("returns false when conflictsWith is null", () => {
    expect(isClaimConflicting(makeClaim({ conflictsWith: null }))).toBe(false)
  })
})
