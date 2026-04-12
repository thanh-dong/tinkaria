import { LOG_PREFIX } from "../shared/branding"
import type { SandboxRecord, SandboxHealthReport } from "../shared/sandbox-types"
import type { SandboxManager } from "./sandbox-manager"

export interface SandboxHealthMonitorOptions {
  sandboxManager: SandboxManager
  getSandboxes: () => Map<string, SandboxRecord>
  onHealthUpdate: (sandboxId: string, report: SandboxHealthReport) => Promise<void>
  onUnhealthy: (sandboxId: string, consecutiveFailures: number) => Promise<void>
  intervalMs?: number
  unhealthyThreshold?: number
}

export class SandboxHealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly failureCounts = new Map<string, number>()
  private readonly intervalMs: number
  private readonly unhealthyThreshold: number

  constructor(private readonly opts: SandboxHealthMonitorOptions) {
    this.intervalMs = opts.intervalMs ?? 15_000
    this.unhealthyThreshold = opts.unhealthyThreshold ?? 3
  }

  start(): void {
    if (this.timer) return
    console.warn(LOG_PREFIX, `Sandbox health monitor started (interval=${this.intervalMs}ms, threshold=${this.unhealthyThreshold})`)
    this.timer = setInterval(() => {
      this.checkAll().catch((err: unknown) => {
        console.warn(LOG_PREFIX, `Health check error: ${err instanceof Error ? err.message : String(err)}`)
      })
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      console.warn(LOG_PREFIX, "Sandbox health monitor stopped")
    }
  }

  async checkAll(): Promise<void> {
    const sandboxes = this.opts.getSandboxes()
    for (const [id, sandbox] of sandboxes) {
      if (sandbox.status !== "running" || !sandbox.containerId) continue
      await this.checkOne(id, sandbox)
    }
  }

  private async checkOne(id: string, sandbox: SandboxRecord): Promise<void> {
    let report: SandboxHealthReport

    try {
      const inspect = await this.opts.sandboxManager.inspect(sandbox.containerId as string)
      report = {
        sandboxId: id,
        workspaceId: sandbox.workspaceId,
        status: inspect.running ? "healthy" : "unhealthy",
        uptimeMs: Date.now() - sandbox.createdAt,
        memoryUsageMb: inspect.memoryUsage,
        cpuPercent: inspect.cpuPercent,
        natsConnected: inspect.running,
      }
    } catch (err: unknown) {
      console.warn(LOG_PREFIX, `Health check failed for ${id}:`, err instanceof Error ? err.message : String(err))
      report = {
        sandboxId: id,
        workspaceId: sandbox.workspaceId,
        status: "unreachable",
        uptimeMs: Date.now() - sandbox.createdAt,
        memoryUsageMb: 0,
        cpuPercent: 0,
        natsConnected: false,
      }
    }

    if (report.status === "healthy") {
      this.failureCounts.delete(id)
    } else {
      const count = (this.failureCounts.get(id) ?? 0) + 1
      this.failureCounts.set(id, count)
      if (count >= this.unhealthyThreshold) {
        await this.opts.onUnhealthy(id, count)
      }
    }

    await this.opts.onHealthUpdate(id, report)
  }

  clearFailures(sandboxId: string): void {
    this.failureCounts.delete(sandboxId)
  }
}
