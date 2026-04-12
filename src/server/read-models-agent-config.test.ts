import { describe, expect, test } from "bun:test"
import { deriveAgentConfigSnapshot } from "./read-models"
import { createEmptyState } from "./events"
import type { AgentConfigRecord } from "../shared/agent-config-types"

describe("deriveAgentConfigSnapshot", () => {
  test("returns correct structure from populated state", () => {
    const state = createEmptyState()
    const workspaceId = "ws-1"
    const now = Date.now()

    const records = new Map<string, AgentConfigRecord>()
    records.set("a1", {
      id: "a1",
      workspaceId,
      config: {
        id: "a1",
        name: "Agent Alpha",
        description: "Test",
        provider: "claude",
        model: "opus-4",
      },
      createdAt: now - 1000,
      updatedAt: now,
      lastCommitHash: "abc123",
    })
    records.set("a2", {
      id: "a2",
      workspaceId,
      config: {
        id: "a2",
        name: "Agent Beta",
        description: "Test 2",
        provider: "codex",
        model: "gpt-5.4",
      },
      createdAt: now - 500,
      updatedAt: now - 200,
    })
    state.agentConfigsByWorkspace.set(workspaceId, records)

    const snapshot = deriveAgentConfigSnapshot(state, workspaceId)

    expect(snapshot.workspaceId).toBe(workspaceId)
    expect(snapshot.configs).toHaveLength(2)
    expect(snapshot.lastUpdated).toBe(new Date(now).toISOString())
    const ids = snapshot.configs.map((c) => c.id).sort()
    expect(ids).toEqual(["a1", "a2"])
  })

  test("returns empty configs for unknown workspace", () => {
    const state = createEmptyState()
    const snapshot = deriveAgentConfigSnapshot(state, "nonexistent")

    expect(snapshot.workspaceId).toBe("nonexistent")
    expect(snapshot.configs).toHaveLength(0)
    expect(snapshot.lastUpdated).toBe(new Date(0).toISOString())
  })
})
