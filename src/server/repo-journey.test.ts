import { describe, test, expect, afterEach } from "bun:test"
import { EventStore } from "./event-store"
import { deriveRepoListSnapshot, deriveWorkspaceCoordinationSnapshot } from "./read-models"
import { rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = join(import.meta.dir, ".test-repo-journey")

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

async function createStoreWithProject() {
  mkdirSync(TEST_DIR, { recursive: true })
  const store = new EventStore(TEST_DIR)
  await store.initialize()
  const project = await store.openProject("/tmp/repo-journey-test", "RepoJourney")
  return { store, workspaceId: project.id }
}

describe("repo journey", () => {
  test("stage 7: add local repo appears in snapshot", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.addRepo("r-1", workspaceId, "/home/user/my-repo", "git@github.com:user/repo.git", "My Repo", "main")

    const snapshot = deriveRepoListSnapshot(store.state, workspaceId)
    expect(snapshot.workspaceId).toBe(workspaceId)
    expect(snapshot.repos).toHaveLength(1)
    expect(snapshot.repos[0].id).toBe("r-1")
    expect(snapshot.repos[0].localPath).toBe("/home/user/my-repo")
    expect(snapshot.repos[0].origin).toBe("git@github.com:user/repo.git")
    expect(snapshot.repos[0].label).toBe("My Repo")
    expect(snapshot.repos[0].branch).toBe("main")
    expect(snapshot.repos[0].status).toBe("cloned")
  })

  test("stage 8: clone repo starts as pending", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.startRepoClone("r-2", workspaceId, "git@github.com:org/lib.git", "/tmp/clones/lib", "Lib Clone")

    const snapshot = deriveRepoListSnapshot(store.state, workspaceId)
    expect(snapshot.repos).toHaveLength(1)
    expect(snapshot.repos[0].id).toBe("r-2")
    expect(snapshot.repos[0].status).toBe("pending")
    expect(snapshot.repos[0].origin).toBe("git@github.com:org/lib.git")
  })

  test("stage 10: remove repo disappears from snapshot", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.addRepo("r-3", workspaceId, "/home/user/old-repo", null, "Old Repo", null)
    const before = deriveRepoListSnapshot(store.state, workspaceId)
    expect(before.repos).toHaveLength(1)

    await store.removeRepo("r-3", workspaceId)
    const after = deriveRepoListSnapshot(store.state, workspaceId)
    expect(after.repos).toHaveLength(0)
  })

  test("repo state survives compact and replay", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.addRepo("r-4", workspaceId, "/home/user/persist-repo", "https://github.com/user/persist.git", "Persist", "develop")

    const snapshotBefore = deriveRepoListSnapshot(store.state, workspaceId)
    expect(snapshotBefore.repos).toHaveLength(1)

    await store.compact()

    const store2 = new EventStore(TEST_DIR)
    await store2.initialize()

    const snapshotAfter = deriveRepoListSnapshot(store2.state, workspaceId)
    expect(snapshotAfter.repos).toHaveLength(1)
    expect(snapshotAfter.repos[0].id).toBe("r-4")
    expect(snapshotAfter.repos[0].localPath).toBe("/home/user/persist-repo")
    expect(snapshotAfter.repos[0].origin).toBe("https://github.com/user/persist.git")
    expect(snapshotAfter.repos[0].label).toBe("Persist")
    expect(snapshotAfter.repos[0].branch).toBe("develop")
  })

  test("claim release updates coordination snapshot", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    await store.createClaim(workspaceId, "c-1", "Refactor auth", ["src/auth.ts"], "session-a")
    const before = deriveWorkspaceCoordinationSnapshot(store.state, workspaceId)
    expect(before.claims).toHaveLength(1)
    expect(before.claims[0].id).toBe("c-1")

    await store.releaseClaim(workspaceId, "c-1")
    const after = deriveWorkspaceCoordinationSnapshot(store.state, workspaceId)
    expect(after.claims).toHaveLength(0)
  })
})
