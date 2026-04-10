import { connect, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { Kvm } from "@nats-io/kv"
import { LOG_PREFIX } from "../shared/branding"
import {
  runnerCmdSubject,
  runnerHeartbeatSubject,
  RUNNER_REGISTRY_BUCKET,
  type StartTurnCommand,
  type CancelTurnCommand,
  type RespondToolCommand,
  type RunnerRegistration,
  type RunnerHeartbeat,
} from "../shared/runner-protocol"
import type { RunnerAgent } from "./runner-agent"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ── Connection lifecycle helpers ────────────────────────────────────

/**
 * Explicit reconnect options applied by {@link connectRunner}. Kept in a named
 * constant so tests and future callers share the same invariants.
 */
export const RUNNER_RECONNECT_OPTIONS = {
  maxReconnectAttempts: -1,
  reconnectTimeWait: 750,
  pingInterval: 15_000,
  maxPingOut: 3,
} as const

export interface ConnectRunnerOptions {
  natsUrl: string
  token?: string | undefined
  /** Dependency-injected for tests; defaults to the real nats-io connect(). */
  connectFn?: typeof connect
}

/**
 * Connect the runner to NATS with explicit reconnect/ping settings so a short
 * network blip never leaves the process silently stranded. Any token, when
 * provided, is forwarded as-is while preserving the reconnect invariants.
 */
export async function connectRunner(
  options: ConnectRunnerOptions,
): Promise<NatsConnection> {
  const { natsUrl, token, connectFn = connect } = options
  return connectFn({
    servers: natsUrl,
    ...(token ? { token } : {}),
    ...RUNNER_RECONNECT_OPTIONS,
  })
}

export interface ShutdownConnectionOptions {
  /** How long to wait for `drain()` before forcing `close()`. Defaults to 3s. */
  drainTimeoutMs?: number
}

/**
 * Drain a NATS connection with a hard timeout, falling back to `close()` so
 * shutdown can't hang indefinitely when the upstream server is already dead.
 * Every failure path is logged with `LOG_PREFIX` and never rethrown — this is
 * the last step of a graceful shutdown and must be resilient.
 */
export async function shutdownConnection(
  nc: NatsConnection,
  options: ShutdownConnectionOptions = {},
): Promise<void> {
  const drainTimeoutMs = options.drainTimeoutMs ?? 3_000
  try {
    await Promise.race([
      nc.drain(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("drain timeout")), drainTimeoutMs),
      ),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      LOG_PREFIX,
      `runner drain timeout or failed: ${message} — falling back to close()`,
    )
    try {
      await nc.close()
    } catch (closeError) {
      const closeMessage =
        closeError instanceof Error ? closeError.message : String(closeError)
      console.warn(LOG_PREFIX, `runner close() also failed: ${closeMessage}`)
    }
  }
}

export interface RunnerNatsHandlerOptions {
  nc: NatsConnection
  agent: RunnerAgent
  runnerId: string
  heartbeatIntervalMs?: number
}

export class RunnerNatsHandler {
  private readonly nc: NatsConnection
  private readonly agent: RunnerAgent
  private readonly runnerId: string
  private readonly heartbeatIntervalMs: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private subscriptions: Subscription[] = []

  constructor(options: RunnerNatsHandlerOptions) {
    this.nc = options.nc
    this.agent = options.agent
    this.runnerId = options.runnerId
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000
  }

  async start(): Promise<void> {
    // Register in KV
    await this.register()

    // Subscribe to commands
    this.subscribeCommand("start_turn", async (data) => {
      const cmd = JSON.parse(data) as StartTurnCommand
      await this.agent.startTurn(cmd)
    })

    this.subscribeCommand("cancel_turn", async (data) => {
      const cmd = JSON.parse(data) as CancelTurnCommand
      await this.agent.cancel(cmd.chatId)
    })

    this.subscribeCommand("respond_tool", async (data) => {
      const cmd = JSON.parse(data) as RespondToolCommand
      await this.agent.respondTool(cmd.chatId, cmd.toolUseId, cmd.result)
    })

    this.subscribeCommand("shutdown", async () => {
      this.dispose()
    })

    // Flush to ensure subscriptions are visible to other connections
    await this.nc.flush()

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => this.publishHeartbeat(), this.heartbeatIntervalMs)
    this.publishHeartbeat()
  }

  dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
    this.subscriptions = []
  }

  private subscribeCommand(cmd: string, handler: (data: string) => Promise<void>): void {
    const subject = runnerCmdSubject(this.runnerId, cmd)
    const sub = this.nc.subscribe(subject)
    this.subscriptions.push(sub)

    void (async () => {
      for await (const msg of sub) {
        try {
          const data = decoder.decode(msg.data)
          await handler(data)
          msg.respond(encoder.encode(JSON.stringify({ ok: true })))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn(LOG_PREFIX, `Runner command ${cmd} failed: ${message}`)
          msg.respond(encoder.encode(JSON.stringify({ ok: false, error: message })))
        }
      }
    })()
  }

  private async register(): Promise<void> {
    try {
      const kvm = new Kvm(this.nc)
      const kvStore = await kvm.create(RUNNER_REGISTRY_BUCKET, {
        max_bytes: 1024 * 1024,
      })
      const registration: RunnerRegistration = {
        runnerId: this.runnerId,
        pid: process.pid,
        startedAt: Date.now(),
        providers: ["claude", "codex"],
      }
      await kvStore.put(this.runnerId, encoder.encode(JSON.stringify(registration)))
    } catch (error) {
      // KV bucket may already exist — try to open instead
      try {
        const kvm = new Kvm(this.nc)
        const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
        const registration: RunnerRegistration = {
          runnerId: this.runnerId,
          pid: process.pid,
          startedAt: Date.now(),
          providers: ["claude", "codex"],
        }
        await kvStore.put(this.runnerId, encoder.encode(JSON.stringify(registration)))
      } catch (innerError) {
        const message = innerError instanceof Error ? innerError.message : String(innerError)
        console.warn(LOG_PREFIX, `Runner KV registration failed: ${message}`)
      }
    }
  }

  private publishHeartbeat(): void {
    const heartbeat: RunnerHeartbeat = {
      runnerId: this.runnerId,
      activeChatIds: [...this.agent.activeTurns.keys()],
      ts: Date.now(),
    }
    try {
      this.nc.publish(
        runnerHeartbeatSubject(this.runnerId),
        encoder.encode(JSON.stringify(heartbeat))
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `runner heartbeat publish failed: ${message}`)
    }
  }

  /**
   * Test-only accessor for {@link publishHeartbeat}. Exercising it through a
   * named method keeps the production path private while letting unit tests
   * verify the try/catch/swallow invariant without touching the private member.
   */
  publishHeartbeatForTest(): void {
    this.publishHeartbeat()
  }
}
