import { describe, test, expect, mock } from "bun:test"
import { NatsCoordinationClient } from "./nats-coordination-client"

describe("NatsCoordinationClient", () => {
  test("addTodo sends NATS command and returns", async () => {
    const mockNc = {
      request: mock(() => Promise.resolve({
        data: new TextEncoder().encode(JSON.stringify({ ok: true, result: { ok: true } })),
      })),
    }
    const client = new NatsCoordinationClient(mockNc as any)

    await client.addTodo("proj-1", "todo-1", "Fix bug", "normal", "session-1")

    expect(mockNc.request).toHaveBeenCalled()
    const callArgs = mockNc.request.mock.calls[0]
    expect(callArgs[0]).toBe("runtime.cmd.project.todo.add")
  })

  test("state.coordinationByProject returns empty map initially", () => {
    const client = new NatsCoordinationClient({} as any)
    expect(client.state.coordinationByProject.size).toBe(0)
  })

  test("throws when server returns error", async () => {
    const mockNc = {
      request: mock(() => Promise.resolve({
        data: new TextEncoder().encode(JSON.stringify({ ok: false, error: "Project not found" })),
      })),
    }
    const client = new NatsCoordinationClient(mockNc as any)
    await expect(client.addTodo("proj-1", "todo-1", "Fix bug", "normal", "session-1")).rejects.toThrow("Project not found")
  })

  test("implements CoordinationStore interface", () => {
    const client = new NatsCoordinationClient({} as any)
    expect(typeof client.addTodo).toBe("function")
    expect(typeof client.claimTodo).toBe("function")
    expect(typeof client.completeTodo).toBe("function")
    expect(typeof client.abandonTodo).toBe("function")
    expect(typeof client.createClaim).toBe("function")
    expect(typeof client.releaseClaim).toBe("function")
    expect(typeof client.createWorktree).toBe("function")
    expect(typeof client.assignWorktree).toBe("function")
    expect(typeof client.removeWorktree).toBe("function")
    expect(typeof client.setRule).toBe("function")
    expect(typeof client.removeRule).toBe("function")
  })
})
