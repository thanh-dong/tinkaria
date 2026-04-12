import { describe, test, expect, mock } from "bun:test"
import type { DockerClient, ExecResult } from "./sandbox-manager"
import { SandboxManager } from "./sandbox-manager"
import type { ContainerInspect } from "../shared/sandbox-types"
import { DEFAULT_RESOURCE_LIMITS } from "../shared/sandbox-types"

function createMockDocker(): DockerClient {
  return {
    create: mock(() => Promise.resolve("container-123")),
    start: mock(() => Promise.resolve()),
    stop: mock(() => Promise.resolve()),
    rm: mock(() => Promise.resolve()),
    exec: mock(() => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 } satisfies ExecResult)),
    logs: mock(() => Promise.resolve("")),
    inspect: mock(() =>
      Promise.resolve({
        id: "container-123",
        status: "running",
        running: true,
        startedAt: "2026-01-01T00:00:00Z",
        memoryUsage: 100,
        cpuPercent: 5,
      } satisfies ContainerInspect),
    ),
  }
}

describe("SandboxManager", () => {
  const NATS_URL = "nats://localhost:4222"
  const IMAGE = "kanna-sandbox:latest"

  test("create() builds correct docker args", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    const id = await mgr.create("ws-abcdef123456", {
      repos: [{ id: "repo1", localPath: "/home/user/repo1" }],
      limits: { cpuShares: 256, memoryMb: 1024, diskMb: 5120, pidsLimit: 128 },
    })

    expect(id).toBe("container-123")
    const args = (docker.create as ReturnType<typeof mock>).mock.calls[0][0] as string[]

    expect(args).toContain("-v")
    expect(args).toContain("/home/user/repo1:/workspace/repo1")
    expect(args).toContain("--memory")
    expect(args).toContain("1024m")
    expect(args).toContain("--cpu-shares")
    expect(args).toContain("256")
    expect(args).toContain("--pids-limit")
    expect(args).toContain("128")
    expect(args[args.length - 1]).toBe(IMAGE)
  })

  test("create() uses default resource limits when not specified", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    await mgr.create("ws-abcdef123456", {
      repos: [{ id: "repo1", localPath: "/tmp/repo1" }],
    })

    const args = (docker.create as ReturnType<typeof mock>).mock.calls[0][0] as string[]
    expect(args).toContain(String(DEFAULT_RESOURCE_LIMITS.cpuShares))
    expect(args).toContain(`${DEFAULT_RESOURCE_LIMITS.memoryMb}m`)
    expect(args).toContain(String(DEFAULT_RESOURCE_LIMITS.pidsLimit))
  })

  test("create() includes security flags", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    await mgr.create("ws-abcdef123456", {
      repos: [{ id: "r", localPath: "/tmp/r" }],
    })

    const args = (docker.create as ReturnType<typeof mock>).mock.calls[0][0] as string[]
    expect(args).toContain("--cap-drop")
    expect(args).toContain("ALL")
    expect(args).toContain("--security-opt=no-new-privileges")
    expect(args).toContain("--read-only")
    expect(args.some((a: string) => a.startsWith("/tmp:"))).toBe(true)
    expect(args).toContain("--add-host=host.docker.internal:host-gateway")
  })

  test("start() calls docker.start", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    await mgr.start("container-123")
    expect(docker.start).toHaveBeenCalledWith("container-123")
  })

  test("stop() calls docker.stop with timeout", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    await mgr.stop("container-123", "shutting down")
    expect(docker.stop).toHaveBeenCalledWith("container-123", 10)
  })

  test("destroy() calls docker.rm with force", async () => {
    const docker = createMockDocker()
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    await mgr.destroy("container-123")
    expect(docker.rm).toHaveBeenCalledWith("container-123", true)
  })

  test("exec() returns ExecResult", async () => {
    const docker = createMockDocker()
    ;(docker.exec as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve({ stdout: "hello", stderr: "", exitCode: 0 }),
    )
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    const result = await mgr.exec("container-123", ["echo", "hello"])
    expect(result.stdout).toBe("hello")
    expect(result.exitCode).toBe(0)
    expect(docker.exec).toHaveBeenCalledWith("container-123", ["echo", "hello"])
  })

  test("logs() passes tail option", async () => {
    const docker = createMockDocker()
    ;(docker.logs as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve("log line 1\nlog line 2"),
    )
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    const logs = await mgr.logs("container-123", 50)
    expect(logs).toBe("log line 1\nlog line 2")
    expect(docker.logs).toHaveBeenCalledWith("container-123", 50)
  })

  test("docker error surfaces as thrown error", async () => {
    const docker = createMockDocker()
    ;(docker.create as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error("daemon not running")),
    )
    const mgr = new SandboxManager(docker, NATS_URL, IMAGE)

    await expect(
      mgr.create("ws-abc", { repos: [{ id: "r", localPath: "/tmp/r" }] }),
    ).rejects.toThrow("daemon not running")
  })
})
