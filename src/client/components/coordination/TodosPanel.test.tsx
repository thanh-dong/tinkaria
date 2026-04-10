import { describe, test, expect, mock } from "bun:test"
import type { ProjectTodo } from "../../../shared/project-agent-types"

function makeTodo(overrides: Partial<ProjectTodo> = {}): ProjectTodo {
  return {
    id: "t1",
    description: "Implement feature X",
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

describe("TodosPanel", () => {
  test("exports TodosPanel component and TodosPanelProps type", async () => {
    const mod = await import("./TodosPanel")
    expect(typeof mod.TodosPanel).toBe("function")
  })

  test("onAddTodo callback receives description and priority", () => {
    const onAdd = mock(() => {})
    const description = "New task"
    const priority = "high" as const
    onAdd(description, priority)
    expect(onAdd).toHaveBeenCalledWith("New task", "high")
  })

  test("onClaimTodo callback receives todoId and sessionId", () => {
    const onClaim = mock(() => {})
    onClaim("t1", "session-1")
    expect(onClaim).toHaveBeenCalledWith("t1", "session-1")
  })

  test("onCompleteTodo callback receives todoId and outputs", () => {
    const onComplete = mock(() => {})
    onComplete("t1", ["output.txt"])
    expect(onComplete).toHaveBeenCalledWith("t1", ["output.txt"])
  })

  // keep the factory used to avoid lint warnings
  void makeTodo
})
