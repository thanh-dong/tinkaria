import { describe, test, expect, mock, afterEach } from "bun:test"
import { SandboxHealthMonitor } from "./sandbox-health"
import type { SandboxRecord } from "../shared/sandbox-types"
import { DEFAULT_RESOURCE_LIMITS } from "../shared/sandbox-types"

function createMockSandbox(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    id: "sb-1",
    workspaceId: "ws-1",
    containerId: "container-123",
    status: "running",
    resourceLimits: DEFAULT_RESOURCE_LIMITS,
    natsUrl: "nats://host.docker.internal:4222",
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    lastHealthCheck: null,
    error: null,
    ...overrides,
  }
}

describe("SandboxHealthMonitor", () => {
  let monitor: SandboxHealthMonitor | null = null

  afterEach(() => {
    monitor?.stop()
    monitor = null
  })

  test("checkAll inspects running sandboxes", async () => {
    const sandboxes = new Map([["sb-1", createMockSandbox()]])
    const onHealthUpdate = mock(() => Promise.resolve())
    const onUnhealthy = mock(() => Promise.resolve())
    const inspectFn = mock(() => Promise.resolve({
      id: "container-123", status: "running", running: true,
      startedAt: "2026-01-01T00:00:00Z", memoryUsage: 256, cpuPercent: 12,
    }))

    monitor = new SandboxHealthMonitor({
      sandboxManager: { inspect: inspectFn } as never,
      getSandboxes: () => sandboxes,
      onHealthUpdate,
      onUnhealthy,
    })

    await monitor.checkAll()
    expect(onHealthUpdate).toHaveBeenCalledTimes(1)
    const report = (onHealthUpdate.mock.calls[0] as unknown[])[1] as { status: string; memoryUsageMb: number }
    expect(report.status).toBe("healthy")
    expect(report.memoryUsageMb).toBe(256)
  })

  test("skips non-running sandboxes", async () => {
    const sandboxes = new Map([["sb-1", createMockSandbox({ status: "stopped" })]])
    const onHealthUpdate = mock(() => Promise.resolve())

    monitor = new SandboxHealthMonitor({
      sandboxManager: { inspect: mock(() => Promise.resolve()) } as never,
      getSandboxes: () => sandboxes,
      onHealthUpdate,
      onUnhealthy: mock(() => Promise.resolve()),
    })

    await monitor.checkAll()
    expect(onHealthUpdate).toHaveBeenCalledTimes(0)
  })

  test("tracks consecutive failures and triggers onUnhealthy", async () => {
    const sandboxes = new Map([["sb-1", createMockSandbox()]])
    const onHealthUpdate = mock(() => Promise.resolve())
    const onUnhealthy = mock(() => Promise.resolve())
    const inspectFn = mock(() => Promise.reject(new Error("connection refused")))

    monitor = new SandboxHealthMonitor({
      sandboxManager: { inspect: inspectFn } as never,
      getSandboxes: () => sandboxes,
      onHealthUpdate,
      onUnhealthy,
      unhealthyThreshold: 2,
    })

    await monitor.checkAll() // failure 1
    expect(onUnhealthy).toHaveBeenCalledTimes(0)

    await monitor.checkAll() // failure 2 — threshold reached
    expect(onUnhealthy).toHaveBeenCalledTimes(1)
    expect((onUnhealthy.mock.calls[0] as unknown[])[1]).toBe(2)
  })

  test("clearFailures resets counter", async () => {
    const sandboxes = new Map([["sb-1", createMockSandbox()]])
    const onUnhealthy = mock(() => Promise.resolve())
    const inspectFn = mock(() => Promise.reject(new Error("fail")))

    monitor = new SandboxHealthMonitor({
      sandboxManager: { inspect: inspectFn } as never,
      getSandboxes: () => sandboxes,
      onHealthUpdate: mock(() => Promise.resolve()),
      onUnhealthy,
      unhealthyThreshold: 2,
    })

    await monitor.checkAll() // failure 1
    monitor.clearFailures("sb-1")
    await monitor.checkAll() // failure 1 again (reset)
    expect(onUnhealthy).toHaveBeenCalledTimes(0)
  })

  test("unhealthy container reports correct status", async () => {
    const sandboxes = new Map([["sb-1", createMockSandbox()]])
    const onHealthUpdate = mock(() => Promise.resolve())
    const inspectFn = mock(() => Promise.resolve({
      id: "container-123", status: "exited", running: false,
      startedAt: "2026-01-01T00:00:00Z", memoryUsage: 0, cpuPercent: 0,
    }))

    monitor = new SandboxHealthMonitor({
      sandboxManager: { inspect: inspectFn } as never,
      getSandboxes: () => sandboxes,
      onHealthUpdate,
      onUnhealthy: mock(() => Promise.resolve()),
    })

    await monitor.checkAll()
    expect(((onHealthUpdate.mock.calls[0] as unknown[])[1] as { status: string }).status).toBe("unhealthy")
  })
})
