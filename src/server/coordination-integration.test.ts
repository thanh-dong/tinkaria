import { describe, test, expect, afterEach } from "bun:test"
import { EventStore } from "./event-store"
import { deriveProjectCoordinationSnapshot } from "./read-models"
import { rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = join(import.meta.dir, ".test-coordination-integration")

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe("coordination integration", () => {
  test("full lifecycle: add todo → claim → complete → read model → compact → replay", async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const store = new EventStore(TEST_DIR)
    await store.initialize()
    const project = await store.openProject("/tmp/test-coord-integration", "Test")
    const projectId = project.id

    await store.addTodo(projectId, "t-1", "Build feature", "high", "session-a")
    await store.claimTodo(projectId, "t-1", "session-b")
    await store.completeTodo(projectId, "t-1", ["feature.ts"])
    await store.createClaim(projectId, "c-1", "Refactor", ["src/a.ts"], "session-a")
    await store.setRule(projectId, "r-1", "No any types", "user")

    const snapshot = deriveProjectCoordinationSnapshot(store.state, projectId)
    expect(snapshot.todos).toHaveLength(1)
    expect(snapshot.todos[0].status).toBe("complete")
    expect(snapshot.claims).toHaveLength(1)
    expect(snapshot.rules).toHaveLength(1)

    await store.compact()

    const store2 = new EventStore(TEST_DIR)
    await store2.initialize()
    const snapshot2 = deriveProjectCoordinationSnapshot(store2.state, projectId)
    expect(snapshot2.todos).toHaveLength(1)
    expect(snapshot2.todos[0].description).toBe("Build feature")
    expect(snapshot2.todos[0].status).toBe("complete")
    expect(snapshot2.claims).toHaveLength(1)
    expect(snapshot2.claims[0].intent).toBe("Refactor")
    expect(snapshot2.rules).toHaveLength(1)
    expect(snapshot2.rules[0].content).toBe("No any types")
  })

  test("claim conflict detection end-to-end", async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const store = new EventStore(TEST_DIR)
    await store.initialize()
    const project = await store.openProject("/tmp/test-coord-conflict", "Test")
    const projectId = project.id

    await store.createClaim(projectId, "c-1", "Auth refactor", ["src/auth.ts", "src/middleware.ts"], "s-1")
    await store.createClaim(projectId, "c-2", "Fix middleware", ["src/middleware.ts"], "s-2")

    const snapshot = deriveProjectCoordinationSnapshot(store.state, projectId)
    const conflictClaim = snapshot.claims.find((c) => c.id === "c-2")
    expect(conflictClaim).toBeDefined()
    expect(conflictClaim!.status).toBe("conflict")
    expect(conflictClaim!.conflictsWith).toBe("c-1")
  })
})
