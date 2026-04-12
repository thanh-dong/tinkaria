import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventStore } from "./event-store"
import type { SnapshotFile } from "./events"
import type { AgentConfig } from "../shared/agent-config-types"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-ac-"))
  tempDirs.push(dir)
  return dir
}

async function createStoreWithWorkspace() {
  const dataDir = await createTempDataDir()
  const store = new EventStore(dataDir)
  await store.initialize()
  const workspace = await store.openProject("/tmp/ac-workspace")
  return { dataDir, store, workspaceId: workspace.id }
}

const makeConfig = (id: string): AgentConfig => ({
  id,
  name: `Agent ${id}`,
  description: `Test agent ${id}`,
  provider: "claude",
  model: "opus-4",
  systemPrompt: "You are helpful.",
  tools: ["bash"],
  temperature: 0.5,
})

describe("EventStore agent config reducers", () => {
  test("saveAgentConfig creates record in agentConfigsByWorkspace", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    const config = makeConfig("a1")

    await store.saveAgentConfig(workspaceId, "a1", config)

    const wsMap = store.state.agentConfigsByWorkspace.get(workspaceId)
    expect(wsMap).toBeDefined()
    const record = wsMap!.get("a1")
    expect(record).toBeDefined()
    expect(record!.id).toBe("a1")
    expect(record!.workspaceId).toBe(workspaceId)
    expect(record!.config).toEqual(config)
    expect(record!.createdAt).toBeGreaterThan(0)
    expect(record!.updatedAt).toBeGreaterThan(0)
    expect(record!.lastCommitHash).toBeUndefined()
  })

  test("commitAgentConfig sets lastCommitHash", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.saveAgentConfig(workspaceId, "a1", makeConfig("a1"))

    await store.commitAgentConfig(workspaceId, "a1", "abc123def")

    const record = store.state.agentConfigsByWorkspace.get(workspaceId)!.get("a1")!
    expect(record.lastCommitHash).toBe("abc123def")
  })

  test("removeAgentConfig deletes record from map", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.saveAgentConfig(workspaceId, "a1", makeConfig("a1"))

    await store.removeAgentConfig(workspaceId, "a1")

    const wsMap = store.state.agentConfigsByWorkspace.get(workspaceId)
    expect(wsMap?.has("a1")).toBe(false)
  })

  test("snapshot round-trip preserves agent configs", async () => {
    const { dataDir, store, workspaceId } = await createStoreWithWorkspace()
    await store.saveAgentConfig(workspaceId, "a1", makeConfig("a1"))
    await store.commitAgentConfig(workspaceId, "a1", "hash1")
    await store.saveAgentConfig(workspaceId, "a2", makeConfig("a2"))

    await store.compact()

    // Verify snapshot file has agentConfigs
    const snapshot = JSON.parse(await readFile(join(dataDir, "snapshot.json"), "utf8")) as SnapshotFile
    expect(snapshot.agentConfigs).toBeDefined()
    expect(snapshot.agentConfigs!.length).toBe(1)
    expect(snapshot.agentConfigs![0].workspaceId).toBe(workspaceId)
    expect(snapshot.agentConfigs![0].records.length).toBe(2)

    // Fresh store from snapshot
    const store2 = new EventStore(dataDir)
    await store2.initialize()

    const wsMap = store2.state.agentConfigsByWorkspace.get(workspaceId)!
    expect(wsMap.size).toBe(2)
    expect(wsMap.get("a1")!.config.name).toBe("Agent a1")
    expect(wsMap.get("a1")!.lastCommitHash).toBe("hash1")
    expect(wsMap.get("a2")!.config.name).toBe("Agent a2")
  })

  test("second save updates updatedAt but preserves createdAt", async () => {
    const { store, workspaceId } = await createStoreWithWorkspace()
    await store.saveAgentConfig(workspaceId, "a1", makeConfig("a1"))

    const record1 = store.state.agentConfigsByWorkspace.get(workspaceId)!.get("a1")!
    const createdAt = record1.createdAt
    const updatedAt1 = record1.updatedAt

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5))

    const updated = { ...makeConfig("a1"), name: "Renamed Agent" }
    await store.saveAgentConfig(workspaceId, "a1", updated)

    const record2 = store.state.agentConfigsByWorkspace.get(workspaceId)!.get("a1")!
    expect(record2.createdAt).toBe(createdAt)
    expect(record2.updatedAt).toBeGreaterThan(updatedAt1)
    expect(record2.config.name).toBe("Renamed Agent")
  })
})
