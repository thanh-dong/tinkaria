import { describe, test, expect, mock } from "bun:test"
import type { DockerClient, ExecResult } from "./sandbox-manager"
import { SandboxManager } from "./sandbox-manager"
import type { ContainerInspect } from "../shared/sandbox-types"
import type { SandboxRecord, SandboxSnapshot } from "../shared/sandbox-types"
import { DEFAULT_RESOURCE_LIMITS } from "../shared/sandbox-types"
import { createEmptyState, type StoreState, type SandboxEvent } from "./events"

function createMockDocker(): DockerClient {
  return {
    create: mock(() => Promise.resolve("ctr-sandbox-001")),
    start: mock(() => Promise.resolve()),
    stop: mock(() => Promise.resolve()),
    rm: mock(() => Promise.resolve()),
    exec: mock(() => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 } satisfies ExecResult)),
    logs: mock(() => Promise.resolve("")),
    inspect: mock(() =>
      Promise.resolve({
        id: "ctr-sandbox-001",
        status: "running",
        running: true,
        startedAt: "2026-01-01T00:00:00Z",
        memoryUsage: 256,
        cpuPercent: 12,
      } satisfies ContainerInspect),
    ),
  }
}

/**
 * Derive a SandboxSnapshot from StoreState for a given workspace.
 * This mirrors what a read model would do -- since event-store does not yet
 * have sandbox projection, we project sandbox events manually for the test.
 */
function deriveSandboxSnapshot(state: StoreState, workspaceId: string): SandboxSnapshot {
  const record = state.sandboxByWorkspace.get(workspaceId) ?? null
  return { workspaceId, sandbox: record, health: null }
}

function applySandboxEvent(state: StoreState, event: SandboxEvent): void {
  switch (event.type) {
    case "sandbox_created": {
      const record: SandboxRecord = {
        id: event.id,
        workspaceId: event.workspaceId,
        containerId: null,
        status: "creating",
        resourceLimits: event.resourceLimits,
        natsUrl: "",
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        lastHealthCheck: null,
        error: null,
      }
      state.sandboxByWorkspace.set(event.workspaceId, record)
      break
    }
    case "sandbox_started": {
      const existing = state.sandboxByWorkspace.get(
        [...state.sandboxByWorkspace.entries()].find(([, r]) => r.id === event.id)?.[0] ?? "",
      )
      if (existing) {
        existing.containerId = event.containerId
        existing.natsUrl = event.natsUrl
        existing.status = "running"
        existing.updatedAt = event.timestamp
      }
      break
    }
    case "sandbox_stopped": {
      const rec = [...state.sandboxByWorkspace.values()].find((r) => r.id === event.id)
      if (rec) {
        rec.status = "stopped"
        rec.updatedAt = event.timestamp
      }
      break
    }
    case "sandbox_destroyed": {
      for (const [wsId, rec] of state.sandboxByWorkspace) {
        if (rec.id === event.id) {
          state.sandboxByWorkspace.delete(wsId)
          break
        }
      }
      break
    }
    case "sandbox_error": {
      const rec = [...state.sandboxByWorkspace.values()].find((r) => r.id === event.id)
      if (rec) {
        rec.status = "error"
        rec.error = event.error
        rec.updatedAt = event.timestamp
      }
      break
    }
    case "sandbox_health_updated": {
      // Health is stored separately in a full impl; skip for now
      break
    }
  }
}

describe("Journey 3: Isolated Dev - Sandbox Lifecycle", () => {
  const NATS_URL = "nats://localhost:4222"
  const WS_ID = "ws-journey3-test"

  test("stage 1: empty state - no sandbox returns null snapshot", () => {
    const state = createEmptyState()
    const snapshot = deriveSandboxSnapshot(state, WS_ID)
    expect(snapshot.workspaceId).toBe(WS_ID)
    expect(snapshot.sandbox).toBeNull()
    expect(snapshot.health).toBeNull()
  })

  test("stage 2: create sandbox records creating status", () => {
    const state = createEmptyState()
    const event: SandboxEvent = {
      v: 3,
      type: "sandbox_created",
      timestamp: Date.now(),
      id: "sb-001",
      workspaceId: WS_ID,
      resourceLimits: DEFAULT_RESOURCE_LIMITS,
    }
    applySandboxEvent(state, event)

    const snapshot = deriveSandboxSnapshot(state, WS_ID)
    expect(snapshot.sandbox).not.toBeNull()
    expect(snapshot.sandbox!.id).toBe("sb-001")
    expect(snapshot.sandbox!.status).toBe("creating")
    expect(snapshot.sandbox!.containerId).toBeNull()
    expect(snapshot.sandbox!.resourceLimits).toEqual(DEFAULT_RESOURCE_LIMITS)
  })

  test("stage 3: start sandbox transitions to running with container id", () => {
    const state = createEmptyState()
    const now = Date.now()
    applySandboxEvent(state, {
      v: 3, type: "sandbox_created", timestamp: now, id: "sb-001", workspaceId: WS_ID, resourceLimits: DEFAULT_RESOURCE_LIMITS,
    })
    applySandboxEvent(state, {
      v: 3, type: "sandbox_started", timestamp: now + 100, id: "sb-001", containerId: "ctr-abc", natsUrl: NATS_URL,
    })

    const snapshot = deriveSandboxSnapshot(state, WS_ID)
    expect(snapshot.sandbox!.status).toBe("running")
    expect(snapshot.sandbox!.containerId).toBe("ctr-abc")
    expect(snapshot.sandbox!.natsUrl).toBe(NATS_URL)
  })

  test("stage 4-5: stop and restart transitions", () => {
    const state = createEmptyState()
    const now = Date.now()
    applySandboxEvent(state, {
      v: 3, type: "sandbox_created", timestamp: now, id: "sb-001", workspaceId: WS_ID, resourceLimits: DEFAULT_RESOURCE_LIMITS,
    })
    applySandboxEvent(state, {
      v: 3, type: "sandbox_started", timestamp: now + 100, id: "sb-001", containerId: "ctr-abc", natsUrl: NATS_URL,
    })

    // Stop
    applySandboxEvent(state, {
      v: 3, type: "sandbox_stopped", timestamp: now + 200, id: "sb-001", reason: "user requested",
    })
    expect(deriveSandboxSnapshot(state, WS_ID).sandbox!.status).toBe("stopped")

    // Restart
    applySandboxEvent(state, {
      v: 3, type: "sandbox_started", timestamp: now + 300, id: "sb-001", containerId: "ctr-abc", natsUrl: NATS_URL,
    })
    expect(deriveSandboxSnapshot(state, WS_ID).sandbox!.status).toBe("running")
  })

  test("stage 6: destroy sandbox returns to empty state", () => {
    const state = createEmptyState()
    const now = Date.now()
    applySandboxEvent(state, {
      v: 3, type: "sandbox_created", timestamp: now, id: "sb-001", workspaceId: WS_ID, resourceLimits: DEFAULT_RESOURCE_LIMITS,
    })
    applySandboxEvent(state, {
      v: 3, type: "sandbox_started", timestamp: now + 100, id: "sb-001", containerId: "ctr-abc", natsUrl: NATS_URL,
    })
    applySandboxEvent(state, {
      v: 3, type: "sandbox_destroyed", timestamp: now + 200, id: "sb-001",
    })

    const snapshot = deriveSandboxSnapshot(state, WS_ID)
    expect(snapshot.sandbox).toBeNull()
  })

  test("error event transitions to error status", () => {
    const state = createEmptyState()
    const now = Date.now()
    applySandboxEvent(state, {
      v: 3, type: "sandbox_created", timestamp: now, id: "sb-001", workspaceId: WS_ID, resourceLimits: DEFAULT_RESOURCE_LIMITS,
    })
    applySandboxEvent(state, {
      v: 3, type: "sandbox_error", timestamp: now + 50, id: "sb-001", error: "image not found",
    })

    const snapshot = deriveSandboxSnapshot(state, WS_ID)
    expect(snapshot.sandbox!.status).toBe("error")
    expect(snapshot.sandbox!.error).toBe("image not found")
  })

  test("full lifecycle through SandboxManager", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL)

    // Create
    const containerId = await mgr.create(WS_ID, {
      repos: [{ id: "repo-1", localPath: "/tmp/repo-1" }],
    })
    expect(containerId).toBe("ctr-sandbox-001")

    // Start
    await mgr.start(containerId)
    expect(docker.start).toHaveBeenCalledWith(containerId)

    // Stop
    await mgr.stop(containerId, "pausing work")
    expect(docker.stop).toHaveBeenCalledWith(containerId, 10)

    // Restart
    await mgr.start(containerId)
    expect((docker.start as ReturnType<typeof mock>).mock.calls).toHaveLength(2)

    // Destroy
    await mgr.destroy(containerId)
    expect(docker.rm).toHaveBeenCalledWith(containerId, true)
  })
})
