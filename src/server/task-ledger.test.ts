// src/server/task-ledger.test.ts
import { describe, expect, test } from "bun:test"
import { TaskLedger } from "./task-ledger"

describe("TaskLedger", () => {
  test("claim creates a new task", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("implement auth", "chat-1", "feat/auth")
    expect(task.description).toBe("implement auth")
    expect(task.ownedBy).toBe("chat-1")
    expect(task.status).toBe("claimed")
    expect(task.branch).toBe("feat/auth")
  })

  test("list returns all tasks", () => {
    const ledger = new TaskLedger()
    ledger.claim("task A", "chat-1", null)
    ledger.claim("task B", "chat-2", null)
    expect(ledger.list().length).toBe(2)
  })

  test("get returns specific task", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("task A", "chat-1", null)
    expect(ledger.get(task.id)).not.toBeNull()
    expect(ledger.get(task.id)!.description).toBe("task A")
  })

  test("get returns null for unknown id", () => {
    const ledger = new TaskLedger()
    expect(ledger.get("nonexistent")).toBeNull()
  })

  test("complete marks task as complete", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("task A", "chat-1", null)
    const updated = ledger.complete(task.id, ["src/auth.ts"])
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe("complete")
    expect(updated!.outputs).toEqual(["src/auth.ts"])
  })

  test("complete returns null for unknown task", () => {
    const ledger = new TaskLedger()
    expect(ledger.complete("nope", [])).toBeNull()
  })

  test("abandon marks task as abandoned", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("task A", "chat-1", null)
    const updated = ledger.abandon(task.id)
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe("abandoned")
  })

  test("detectAbandoned marks idle sessions' tasks", () => {
    const ledger = new TaskLedger({ abandonTimeoutMs: 100 })
    const task = ledger.claim("task A", "chat-1", null)

    // Manually backdate the task
    ledger.updateTimestamp(task.id, new Date(Date.now() - 200).toISOString())

    const abandoned = ledger.detectAbandoned()
    expect(abandoned.length).toBe(1)
    expect(abandoned[0].id).toBe(task.id)
    expect(abandoned[0].status).toBe("abandoned")
  })

  test("detectAbandoned skips completed tasks", () => {
    const ledger = new TaskLedger({ abandonTimeoutMs: 100 })
    const task = ledger.claim("task A", "chat-1", null)
    ledger.complete(task.id, [])
    ledger.updateTimestamp(task.id, new Date(Date.now() - 200).toISOString())

    const abandoned = ledger.detectAbandoned()
    expect(abandoned.length).toBe(0)
  })

  test("listBySession filters tasks by owner", () => {
    const ledger = new TaskLedger()
    ledger.claim("task A", "chat-1", null)
    ledger.claim("task B", "chat-2", null)
    ledger.claim("task C", "chat-1", null)

    expect(ledger.listBySession("chat-1").length).toBe(2)
    expect(ledger.listBySession("chat-2").length).toBe(1)
  })
})
