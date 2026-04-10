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

async function createStoreWithProject() {
  const store = createTestStore()
  await store.initialize()
  const project = await store.openProject("/tmp/coord-mcp-test")
  return { store, projectId: project.id }
}

type ToolRegistry = Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>

function getTools(store: EventStore) {
  const server = createCoordinationMcpServer(store)
  return (server.instance as unknown as { _registeredTools: ToolRegistry })._registeredTools
}

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

describe("coordination MCP tool handlers", () => {
  test("project_todo_add creates a todo and returns it", async () => {
    const { store, projectId } = await createStoreWithProject()
    const tools = getTools(store)

    const result = await tools.project_todo_add.handler({
      projectId,
      description: "Fix the login bug",
      priority: "high",
      createdBy: "session-a",
    }) as { content: Array<{ text: string }> }

    const todo = JSON.parse(result.content[0].text)
    expect(todo.description).toBe("Fix the login bug")
    expect(todo.priority).toBe("high")
    expect(todo.status).toBe("open")
    expect(todo.createdBy).toBe("session-a")
    expect(todo.id).toBeDefined()
  })

  test("project_claim_create detects conflicts on overlapping files", async () => {
    const { store, projectId } = await createStoreWithProject()
    const tools = getTools(store)

    // First claim — no conflict
    await tools.project_claim_create.handler({
      projectId,
      intent: "Refactor auth",
      files: ["src/auth.ts", "src/login.ts"],
      sessionId: "s-1",
    })

    // Overlapping claim — should detect conflict
    const conflictResult = await tools.project_claim_create.handler({
      projectId,
      intent: "Fix login",
      files: ["src/login.ts"],
      sessionId: "s-2",
    }) as { content: Array<{ text: string }> }

    const claim = JSON.parse(conflictResult.content[0].text)
    expect(claim.status).toBe("conflict")
    expect(claim.conflictsWith).toBeDefined()
  })

  test("project_snapshot_get returns full coordination state", async () => {
    const { store, projectId } = await createStoreWithProject()
    const tools = getTools(store)

    await tools.project_todo_add.handler({ projectId, description: "Task A" })
    await tools.project_rule_set.handler({ projectId, content: "Use strict TypeScript" })

    const result = await tools.project_snapshot_get.handler({ projectId }) as { content: Array<{ text: string }> }

    const snapshot = JSON.parse(result.content[0].text)
    expect(snapshot.projectId).toBe(projectId)
    expect(snapshot.todos).toHaveLength(1)
    expect(snapshot.rules).toHaveLength(1)
  })

  test("todo lifecycle: add → claim → complete", async () => {
    const { store, projectId } = await createStoreWithProject()
    const tools = getTools(store)

    // Add
    const addResult = await tools.project_todo_add.handler({
      projectId,
      description: "Build feature X",
      createdBy: "s-1",
    }) as { content: Array<{ text: string }> }
    const todoId = JSON.parse(addResult.content[0].text).id

    // Claim
    const claimResult = await tools.project_todo_claim.handler({
      projectId,
      todoId,
      sessionId: "s-2",
    }) as { content: Array<{ text: string }> }
    expect(JSON.parse(claimResult.content[0].text).status).toBe("claimed")
    expect(JSON.parse(claimResult.content[0].text).claimedBy).toBe("s-2")

    // Complete
    const completeResult = await tools.project_todo_complete.handler({
      projectId,
      todoId,
      outputs: ["feature-x.ts"],
    }) as { content: Array<{ text: string }> }
    expect(JSON.parse(completeResult.content[0].text).status).toBe("complete")
    expect(JSON.parse(completeResult.content[0].text).outputs).toEqual(["feature-x.ts"])
  })
})
