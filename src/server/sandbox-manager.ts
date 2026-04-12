import { LOG_PREFIX } from "../shared/branding"
import type { ResourceLimits, ContainerInspect } from "../shared/sandbox-types"
import { DEFAULT_RESOURCE_LIMITS } from "../shared/sandbox-types"

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface DockerClient {
  create(args: string[]): Promise<string>
  start(containerId: string): Promise<void>
  stop(containerId: string, timeoutSecs?: number): Promise<void>
  rm(containerId: string, force?: boolean): Promise<void>
  exec(containerId: string, cmd: string[]): Promise<ExecResult>
  logs(containerId: string, tail?: number): Promise<string>
  inspect(containerId: string): Promise<ContainerInspect>
}

export class BunDockerClient implements DockerClient {
  private async run(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn(["docker", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`docker ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`)
    }
    return { stdout, stderr, exitCode }
  }

  async create(args: string[]): Promise<string> {
    const result = await this.run(["create", ...args])
    return result.stdout.trim()
  }

  async start(containerId: string): Promise<void> {
    await this.run(["start", containerId])
  }

  async stop(containerId: string, timeoutSecs = 10): Promise<void> {
    await this.run(["stop", "-t", String(timeoutSecs), containerId])
  }

  async rm(containerId: string, force = false): Promise<void> {
    const args = force ? ["rm", "-f", containerId] : ["rm", containerId]
    await this.run(args)
  }

  async exec(containerId: string, cmd: string[]): Promise<ExecResult> {
    const proc = Bun.spawn(["docker", "exec", containerId, ...cmd], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode }
  }

  async logs(containerId: string, tail = 100): Promise<string> {
    const result = await this.run(["logs", "--tail", String(tail), containerId])
    return result.stdout
  }

  async inspect(containerId: string): Promise<ContainerInspect> {
    const result = await this.run(["inspect", "--format", "{{json .}}", containerId])
    try {
      return JSON.parse(result.stdout) as ContainerInspect
    } catch {
      throw new Error(`Failed to parse docker inspect output for ${containerId}`)
    }
  }
}

export class SandboxManager {
  constructor(
    private readonly docker: DockerClient,
    private readonly natsUrl: string,
    private readonly imageName: string = "kanna-sandbox:latest",
  ) {}

  getNatsUrl(): string {
    return this.natsUrl
  }

  async create(
    workspaceId: string,
    opts: { repos: Array<{ id: string; localPath: string }>; limits?: ResourceLimits },
  ): Promise<string> {
    const limits = opts.limits ?? DEFAULT_RESOURCE_LIMITS
    const args: string[] = []

    for (const repo of opts.repos) {
      args.push("-v", `${repo.localPath}:/workspace/${repo.id}`)
    }

    args.push("-e", `NATS_URL=${this.natsUrl}`)
    args.push("-e", `WORKSPACE_ID=${workspaceId}`)
    args.push("--name", `kanna-sandbox-${workspaceId.slice(0, 12)}`)

    // Security flags
    args.push("--cap-drop", "ALL")
    args.push("--security-opt=no-new-privileges")
    args.push("--read-only")
    args.push("--tmpfs", "/tmp:size=128m")
    args.push("--add-host=host.docker.internal:host-gateway")

    // Resource limits
    args.push("--cpu-shares", String(limits.cpuShares))
    args.push("--memory", `${limits.memoryMb}m`)
    args.push("--pids-limit", String(limits.pidsLimit))

    args.push(this.imageName)

    try {
      return await this.docker.create(args)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(LOG_PREFIX, `Failed to create sandbox for ${workspaceId}: ${msg}`)
      throw err
    }
  }

  async start(containerId: string): Promise<void> {
    await this.docker.start(containerId)
  }

  async stop(containerId: string, reason?: string): Promise<void> {
    if (reason) {
      console.warn(LOG_PREFIX, `Stopping container ${containerId}: ${reason}`)
    }
    await this.docker.stop(containerId, 10)
  }

  async destroy(containerId: string): Promise<void> {
    await this.docker.rm(containerId, true)
  }

  async exec(containerId: string, cmd: string[]): Promise<ExecResult> {
    return this.docker.exec(containerId, cmd)
  }

  async logs(containerId: string, tail?: number): Promise<string> {
    return this.docker.logs(containerId, tail)
  }

  async inspect(containerId: string): Promise<ContainerInspect> {
    return this.docker.inspect(containerId)
  }
}
