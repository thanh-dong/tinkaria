import { describe, test, expect, afterEach } from "bun:test"
import { EventStore } from "./event-store"
import { deriveAgentConfigSnapshot } from "./read-models"
import type { AgentConfig } from "../shared/agent-config-types"
import { rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = join(import.meta.dir, ".test-agent-config-journey")

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

async function createStoreWithProject() {
  mkdirSync(TEST_DIR, { recursive: true })
  const store = new EventStore(TEST_DIR)
  await store.initialize()
  const project = await store.openProject("/tmp/agent-config-journey-test", "AgentConfigJourney")
  return { store, workspaceId: project.id }
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "cfg-1",
    name: "Test Agent",
    description: "A test agent config",
    provider: "claude",
    model: "claude-sonnet-4-20250514",
    ...overrides,
  }
}

describe("agent config journey", () => {
  test("stage 3: save agent config appears in snapshot", async () => {
    const { store, workspaceId } = await createStoreWithProject()
    const config = makeConfig()

    await store.saveAgentConfig(workspaceId, config.id, config)

    const snapshot = deriveAgentConfigSnapshot(store.state, workspaceId)
    expect(snapshot.workspaceId).toBe(workspaceId)
    expect(snapshot.configs).toHaveLength(1)
    expect(snapshot.configs[0].id).toBe(config.id)
    expect(snapshot.configs[0].config.name).toBe("Test Agent")
    expect(snapshot.configs[0].config.provider).toBe("claude")
    expect(snapshot.configs[0].workspaceId).toBe(workspaceId)
  })

  test("stage 4: update agent config (save again) updates in snapshot", async () => {
    const { store, workspaceId } = await createStoreWithProject()
    const config = makeConfig()

    await store.saveAgentConfig(workspaceId, config.id, config)
    await new Promise((r) => setTimeout(r, 5))
    const updated = makeConfig({ name: "Updated Agent", model: "claude-opus-4-20250514" })
    await store.saveAgentConfig(workspaceId, config.id, updated)

    const snapshot = deriveAgentConfigSnapshot(store.state, workspaceId)
    expect(snapshot.configs).toHaveLength(1)
    expect(snapshot.configs[0].config.name).toBe("Updated Agent")
    expect(snapshot.configs[0].config.model).toBe("claude-opus-4-20250514")
    expect(snapshot.configs[0].updatedAt).toBeGreaterThan(snapshot.configs[0].createdAt)
  })

  test("stage 5: remove agent config disappears from snapshot", async () => {
    const { store, workspaceId } = await createStoreWithProject()
    const config = makeConfig()

    await store.saveAgentConfig(workspaceId, config.id, config)
    expect(deriveAgentConfigSnapshot(store.state, workspaceId).configs).toHaveLength(1)

    await store.removeAgentConfig(workspaceId, config.id)
    const snapshot = deriveAgentConfigSnapshot(store.state, workspaceId)
    expect(snapshot.configs).toHaveLength(0)
  })

  test("agent config survives compact and replay", async () => {
    const { store, workspaceId } = await createStoreWithProject()
    const config = makeConfig({ id: "cfg-persist", name: "Persistent Agent" })

    await store.saveAgentConfig(workspaceId, config.id, config)
    const before = deriveAgentConfigSnapshot(store.state, workspaceId)
    expect(before.configs).toHaveLength(1)

    await store.compact()

    const store2 = new EventStore(TEST_DIR)
    await store2.initialize()

    const after = deriveAgentConfigSnapshot(store2.state, workspaceId)
    expect(after.configs).toHaveLength(1)
    expect(after.configs[0].id).toBe("cfg-persist")
    expect(after.configs[0].config.name).toBe("Persistent Agent")
    expect(after.configs[0].config.provider).toBe("claude")
    expect(after.configs[0].workspaceId).toBe(workspaceId)
  })

  test("empty workspace returns empty configs", async () => {
    const { store, workspaceId } = await createStoreWithProject()

    const snapshot = deriveAgentConfigSnapshot(store.state, workspaceId)
    expect(snapshot.workspaceId).toBe(workspaceId)
    expect(snapshot.configs).toHaveLength(0)
    expect(snapshot.lastUpdated).toBe(new Date(0).toISOString())
  })
})
