import { describe, test, expect, afterEach } from "bun:test"
import { createCoordinationMcpServer } from "./coordination-mcp"
import { EventStore } from "./event-store"
import { rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = join(import.meta.dir, ".test-coordination-mcp")

function createTestStore() {
  mkdirSync(TEST_DIR, { recursive: true })
  return new EventStore(TEST_DIR)
}

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe("createCoordinationMcpServer", () => {
  test("registers all 12 coordination tools", async () => {
    const store = createTestStore()
    await store.initialize()

    const server = createCoordinationMcpServer(store)
    const tools = Object.keys(
      (server.instance as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    )

    expect(tools).toEqual([
      "project_todo_add",
      "project_todo_claim",
      "project_todo_complete",
      "project_todo_abandon",
      "project_claim_create",
      "project_claim_release",
      "project_worktree_create",
      "project_worktree_assign",
      "project_worktree_remove",
      "project_rule_set",
      "project_rule_remove",
      "project_snapshot_get",
    ])
  })
})
