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
  const dir = await mkdtemp(join(tmpdir(), "kanna-repo-"))
  tempDirs.push(dir)
  return dir
}

async function createStoreWithWorkspace() {
  const dataDir = await createTempDataDir()
  const store = new EventStore(dataDir)
  await store.initialize()
  const workspace = await store.openProject("/tmp/repo-workspace")
  return { dataDir, store, workspaceId: workspace.id }
}

describe("EventStore repo reducers", () => {
  test("addRepo creates record in reposById with status cloned", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()

    await store.addRepo("r1", workspaceId, "/tmp/my-repo", "https://github.com/org/repo.git", "My Repo", "main")

    const repo = store.state.reposById.get("r1")
    expect(repo).toBeDefined()
    expect(repo!.id).toBe("r1")
    expect(repo!.workspaceId).toBe(workspaceId)
    expect(repo!.origin).toBe("https://github.com/org/repo.git")
    expect(repo!.localPath).toBe("/tmp/my-repo")
    expect(repo!.label).toBe("My Repo")
    expect(repo!.status).toBe("cloned")
    expect(repo!.branch).toBe("main")
    expect(repo!.createdAt).toBeGreaterThan(0)
    expect(store.state.reposByPath.get("/tmp/my-repo")).toBe("r1")
  })

  test("startRepoClone creates record with status pending and indexes reposByPath", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()

    await store.startRepoClone("r2", workspaceId, "https://github.com/org/repo.git", "/tmp/target", "Clone Label")

    const repo = store.state.reposById.get("r2")
    expect(repo).toBeDefined()
    expect(repo!.status).toBe("pending")
    expect(repo!.origin).toBe("https://github.com/org/repo.git")
    expect(repo!.localPath).toBe("/tmp/target")
    expect(repo!.branch).toBeNull()
    expect(store.state.reposByPath.get("/tmp/target")).toBe("r2")
  })

  test("markRepoCloned transitions status to cloned and sets localPath", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.startRepoClone("r3", workspaceId, "https://github.com/org/repo.git", "/tmp/target", null)

    await store.markRepoCloned("r3", "/tmp/cloned-path", "develop")

    const repo = store.state.reposById.get("r3")
    expect(repo!.status).toBe("cloned")
    expect(repo!.localPath).toBe("/tmp/cloned-path")
    expect(repo!.branch).toBe("develop")
    expect(store.state.reposByPath.get("/tmp/cloned-path")).toBe("r3")
  })

  test("markRepoCloneFailed transitions status to error", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.startRepoClone("r4", workspaceId, "https://github.com/org/repo.git", "/tmp/target", null)

    await store.markRepoCloneFailed("r4", "clone failed: timeout")

    const repo = store.state.reposById.get("r4")
    expect(repo!.status).toBe("error")
  })

  test("removeRepo deletes from both maps", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.addRepo("r5", workspaceId, "/tmp/to-remove", null, null, null)

    await store.removeRepo("r5", workspaceId)

    expect(store.state.reposById.has("r5")).toBe(false)
    expect(store.state.reposByPath.has("/tmp/to-remove")).toBe(false)
  })

  test("updateRepoLabel updates label", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.addRepo("r6", workspaceId, "/tmp/label-repo", null, "Old Label", null)

    await store.updateRepoLabel("r6", "New Label")

    const repo = store.state.reposById.get("r6")
    expect(repo!.label).toBe("New Label")
    expect(repo!.updatedAt).toBeGreaterThan(repo!.createdAt - 1)
  })

  test("createChat with repoId stores the association", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.addRepo("r-chat", workspaceId, "/tmp/chat-repo", null, null, null)

    const chat = await store.createChat(workspaceId, "r-chat")

    expect(chat.repoId).toBe("r-chat")
  })

  test("createChat without repoId defaults to null", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()

    const chat = await store.createChat(workspaceId)

    expect(chat.repoId).toBeNull()
  })

  test("removeRepo nullifies repoId on orphaned chats", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.addRepo("r-orphan", workspaceId, "/tmp/orphan-repo", null, null, null)
    const chat = await store.createChat(workspaceId, "r-orphan")

    expect(store.state.chatsById.get(chat.id)!.repoId).toBe("r-orphan")

    await store.removeRepo("r-orphan", workspaceId)

    expect(store.state.chatsById.get(chat.id)!.repoId).toBeNull()
  })

  test("snapshot round-trip preserves repos", async () => {
    const { dataDir, store, workspaceId } = await createStoreWithWorkspace()
    await store.addRepo("r7", workspaceId, "/tmp/snap-repo", "https://github.com/org/snap.git", "Snap Repo", "main")
    await store.addRepo("r8", workspaceId, "/tmp/snap-repo2", null, null, null)

    await store.compact()

    const snapshot = JSON.parse(await readFile(join(dataDir, "snapshot.json"), "utf8")) as SnapshotFile
    expect(snapshot.repos).toBeDefined()
    expect(snapshot.repos!.length).toBe(2)

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    expect(store2.state.reposById.size).toBe(2)
    expect(store2.state.reposById.get("r7")!.label).toBe("Snap Repo")
    expect(store2.state.reposById.get("r7")!.origin).toBe("https://github.com/org/snap.git")
    expect(store2.state.reposByPath.get("/tmp/snap-repo")).toBe("r7")
    expect(store2.state.reposByPath.get("/tmp/snap-repo2")).toBe("r8")
  })
})
