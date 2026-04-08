import type { NatsConnection } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import {
  runnerCmdSubject,
  RUNNER_REGISTRY_BUCKET,
  type RunnerRegistration,
} from "../shared/runner-protocol"
import { LOG_PREFIX } from "../shared/branding"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface RunnerManagerOptions {
  nc: NatsConnection
  natsUrl: string
  authToken?: string
}

export class RunnerManager {
  private readonly nc: NatsConnection
  private readonly natsUrl: string
  private readonly authToken: string | undefined
  private proc: ReturnType<typeof Bun.spawn> | null = null
  private runnerId: string | null = null

  constructor(options: RunnerManagerOptions) {
    this.nc = options.nc
    this.natsUrl = options.natsUrl
    this.authToken = options.authToken
  }

  getRunnerId(): string {
    if (!this.runnerId) throw new Error("Runner not started")
    return this.runnerId
  }

  async ensureRunner(): Promise<string> {
    // Check if runner already exists in KV and is alive
    if (this.runnerId) {
      try {
        const kvm = new Kvm(this.nc)
        const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        const entry = await kvStore.get(this.runnerId)
        if (entry) {
          const reg = JSON.parse(decoder.decode(entry.value)) as RunnerRegistration
          try {
            process.kill(reg.pid, 0) // check alive (signal 0 = no signal, just check)
            return this.runnerId
          } catch {
            // Process dead, fall through to respawn
          }
        }
      } catch {
        // KV bucket might not exist yet, proceed to spawn
      }
    }

    // Spawn new runner
    const runnerId = `runner-${Date.now()}-${process.pid}`
    const runnerScript = new URL("../runner/runner.ts", import.meta.url).pathname

    this.proc = Bun.spawn(["bun", "run", runnerScript], {
      env: {
        ...process.env,
        NATS_URL: this.natsUrl,
        ...(this.authToken ? { NATS_TOKEN: this.authToken } : {}),
        RUNNER_ID: runnerId,
      },
      stdio: ["ignore", "inherit", "inherit"],
    })

    this.runnerId = runnerId

    // Wait for runner to register in KV
    await this.waitForRegistration(runnerId, 15_000)

    console.warn(LOG_PREFIX, `Runner ${runnerId} spawned (pid: ${this.proc.pid})`)

    return runnerId
  }

  private async waitForRegistration(runnerId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    const kvm = new Kvm(this.nc)
    let kvStore: Awaited<ReturnType<typeof kvm.open>> | null = null
    while (Date.now() < deadline) {
      try {
        if (!kvStore) kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        const entry = await kvStore.get(runnerId)
        if (entry) return
      } catch {
        kvStore = null // KV not ready yet, retry open next iteration
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`Runner ${runnerId} did not register within ${timeoutMs}ms`)
  }

  async dispose(): Promise<void> {
    if (this.runnerId && this.proc) {
      // Try graceful shutdown via NATS command, then SIGTERM as fallback
      try {
        await this.nc.request(
          runnerCmdSubject(this.runnerId, "shutdown"),
          encoder.encode(JSON.stringify({ reason: "server shutdown" })),
          { timeout: 3000 },
        )
      } catch {
        // NATS request failed or timed out
      }

      // Always send SIGTERM — the NATS shutdown command only cleans up
      // subscriptions but doesn't exit the process
      try {
        this.proc.kill("SIGTERM")
      } catch {
        // Process may already be gone
      }
    }

    if (this.proc) {
      await this.proc.exited
      this.proc = null
    }

    this.runnerId = null
    console.warn(LOG_PREFIX, "Runner manager disposed")
  }
}
