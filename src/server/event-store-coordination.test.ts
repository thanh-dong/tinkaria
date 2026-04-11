import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventStore } from "./event-store"
import type { SnapshotFile } from "./events"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-coord-"))
  tempDirs.push(dir)
  return dir
}

async function createStoreWithProject() {
  const dataDir = await createTempDataDir()
  const store = new EventStore(dataDir)
  await store.initialize()
  const project = await store.openProject("/tmp/coord-project")
  return { dataDir, store, workspaceId: project.id }
}

describe("EventStore coordination", () => {
  test("appends todo_added and replays on restart", async () => {
    const { dataDir, store, workspaceId } = await createStoreWithProject()

    await store.addTodo(workspaceId, "t1", "Build feature X", "high", "agent-1")

    const coord = store.state.coordinationByWorkspace.get(workspaceId)!
    expect(coord.todos.get("t1")).toMatchObject({
      id: "t1",
      description: "Build feature X",
      priority: "high",
      status: "open",
      claimedBy: null,
      createdBy: "agent-1",
    })

    // Replay on restart
    const store2 = new EventStore(dataDir)
    await store2.initialize()
    const coord2 = store2.state.coordinationByWorkspace.get(workspaceId)!
    expect(coord2.todos.get("t1")?.description).toBe("Build feature X")
  })

  test("todo claim, complete, abandon lifecycle", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.addTodo(workspaceId, "t1", "Task A", "normal", "agent-1")
    await store.claimTodo(workspaceId, "t1", "agent-2")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.todos.get("t1")?.status).toBe("claimed")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.todos.get("t1")?.claimedBy).toBe("agent-2")

    await store.completeTodo(workspaceId, "t1", ["output.ts"])
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.todos.get("t1")?.status).toBe("complete")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.todos.get("t1")?.outputs).toEqual(["output.ts"])

    await store.addTodo(workspaceId, "t2", "Task B", "low", "agent-1")
    await store.claimTodo(workspaceId, "t2", "agent-3")
    await store.abandonTodo(workspaceId, "t2")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.todos.get("t2")?.status).toBe("abandoned")
  })

  test("claim with file overlap detects conflict", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.createClaim(workspaceId, "c1", "Refactor auth", ["src/auth.ts", "src/login.ts"], "session-1")
    await store.createClaim(workspaceId, "c2", "Fix login bug", ["src/login.ts", "src/utils.ts"], "session-2")

    const c2 = store.state.coordinationByWorkspace.get(workspaceId)!.claims.get("c2")!
    expect(c2.status).toBe("conflict")
    expect(c2.conflictsWith).toBe("c1")
  })

  test("worktree create and assign", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.createWorktree(workspaceId, "w1", "feat/auth", "main", "/tmp/wt1")
    const wt = store.state.coordinationByWorkspace.get(workspaceId)!.worktrees.get("w1")!
    expect(wt.status).toBe("ready")
    expect(wt.assignedTo).toBeNull()

    await store.assignWorktree(workspaceId, "w1", "session-1")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.worktrees.get("w1")?.status).toBe("assigned")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.worktrees.get("w1")?.assignedTo).toBe("session-1")

    await store.removeWorktree(workspaceId, "w1")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.worktrees.get("w1")?.status).toBe("removed")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.worktrees.get("w1")?.assignedTo).toBeNull()
  })

  test("rule set and remove", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.setRule(workspaceId, "r1", "No console.log in production", "lead")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.rules.get("r1")?.content).toBe("No console.log in production")

    await store.setRule(workspaceId, "r1", "No console.log or debugger", "lead")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.rules.get("r1")?.content).toBe("No console.log or debugger")

    await store.removeRule(workspaceId, "r1")
    expect(store.state.coordinationByWorkspace.get(workspaceId)!.rules.has("r1")).toBe(false)
  })

  test("compact preserves coordination state", async () => {
    const { dataDir, store, workspaceId } = await createStoreWithProject()

    await store.addTodo(workspaceId, "t1", "Survive compaction", "high", "agent-1")
    await store.setRule(workspaceId, "r1", "Be excellent", "lead")
    await store.compact()

    // Coordination JSONL should be truncated
    expect(await readFile(join(dataDir, "coordination.jsonl"), "utf8")).toBe("")

    // Snapshot should have coordination
    const snapshot = JSON.parse(await readFile(join(dataDir, "snapshot.json"), "utf8")) as SnapshotFile
    expect(snapshot.coordination).toBeDefined()
    expect(snapshot.coordination!.length).toBe(1)
    expect(snapshot.coordination![0].workspaceId).toBe(workspaceId)

    // New store should restore from snapshot
    const store2 = new EventStore(dataDir)
    await store2.initialize()
    expect(store2.state.coordinationByWorkspace.get(workspaceId)!.todos.get("t1")?.description).toBe("Survive compaction")
    expect(store2.state.coordinationByWorkspace.get(workspaceId)!.rules.get("r1")?.content).toBe("Be excellent")
  })

  test("clearStorage resets coordination state", async () => {
    const { dataDir, store, workspaceId } = await createStoreWithProject()

    await store.addTodo(workspaceId, "t1", "Will be cleared", "normal", "agent-1")

    // Force a version mismatch to trigger clearStorage during replay
    const coordPath = join(dataDir, "coordination.jsonl")
    const { writeFile } = await import("node:fs/promises")
    await writeFile(coordPath, '{"v":999,"type":"todo_added"}\n', "utf8")

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    // State should be empty after clearStorage
    expect(store2.state.coordinationByWorkspace.size).toBe(0)
  })
})
