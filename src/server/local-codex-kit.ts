import { connect, type Msg, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { jetstream, DeliverPolicy } from "@nats-io/jetstream"
import type { JetStreamClient } from "@nats-io/jetstream"
import { LOG_PREFIX } from "../shared/branding"
import {
  codexKitHeartbeatSubject,
  codexKitRegisterSubject,
  codexKitSessionEnsureSubject,
  codexKitSessionStopSubject,
  codexKitToolRespondSubject,
  codexKitTurnEventsSubject,
  codexKitTurnInterruptSubject,
  codexKitTurnStartSubject,
} from "../shared/nats-subjects"
import { KIT_TURN_EVENTS_STREAM } from "./nats-streams"
import type { HarnessEvent, HarnessToolRequest, HarnessTurn } from "./harness-types"
import {
  CodexAppServerManager,
  type StartCodexSessionArgs,
  type StartCodexTurnArgs,
} from "./codex-app-server"
import type { CodexRuntime, StartCodexRuntimeSessionArgs } from "./codex-runtime"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(data: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(data))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly resolvers: Array<(value: IteratorResult<T>) => void> = []
  private done = false

  push(value: T) {
    if (this.done) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value, done: false })
      return
    }
    this.values.push(value)
  }

  finish() {
    if (this.done) return
    this.done = true
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.({ value: undefined as T, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length > 0) {
          return Promise.resolve({ value: this.values.shift() as T, done: false })
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as T, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve)
        })
      },
    }
  }
}

export interface CodexKitRegistration {
  kitId: string
  provider: "codex"
  displayName: string
  settingsIdentity: string
  registeredAt: number
}

type KitRequest<T> =
  | { ok: true; result: T }
  | { ok: false; error: string }

type KitStreamEnvelope =
  | { type: "harness_event"; event: HarnessEvent }
  | { type: "tool_request"; request: HarnessToolRequest }
  | { type: "stream_end" }
  | { type: "stream_error"; error: string }

interface StartKitTurnRequest {
  chatId: string
  content: string
  model: string
  effort?: StartCodexTurnArgs["effort"]
  serviceTier?: StartCodexTurnArgs["serviceTier"]
  planMode: boolean
  skills?: string[]
}

interface ToolResponseRequest {
  chatId: string
  toolUseId: string
  result: unknown
}

interface ActiveKitTurn {
  turn: HarnessTurn
  pendingToolResponses: Map<string, (result: unknown) => void>
}

export class ProjectKitRegistry {
  private readonly kits = new Map<string, CodexKitRegistration>()
  private readonly projectAssignments = new Map<string, string>()
  private readonly subscriptions: Subscription[]
  private readonly waiters = new Set<(kit: CodexKitRegistration) => void>()

  constructor(nc: NatsConnection) {
    this.subscriptions = [
      nc.subscribe(codexKitRegisterSubject()),
      nc.subscribe(codexKitHeartbeatSubject("*")),
    ]
    for (const sub of this.subscriptions) {
      void this.consume(sub)
    }
  }

  private async consume(sub: Subscription) {
    for await (const msg of sub) {
      try {
        const registration = msg.json<CodexKitRegistration>()
        this.kits.set(registration.kitId, registration)
        for (const waiter of this.waiters) {
          waiter(registration)
        }
        this.waiters.clear()
      } catch {
        // Ignore malformed kit metadata.
      }
    }
  }

  private firstKit(): CodexKitRegistration | null {
    const kits = [...this.kits.values()].sort((left, right) =>
      left.registeredAt === right.registeredAt
        ? left.kitId.localeCompare(right.kitId)
        : left.registeredAt - right.registeredAt
    )
    return kits[0] ?? null
  }

  async waitForAvailableKit(timeoutMs = 5_000): Promise<CodexKitRegistration> {
    const existing = this.firstKit()
    if (existing) return existing

    return await new Promise<CodexKitRegistration>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(handleReady)
        reject(new Error("No Codex kit is connected"))
      }, timeoutMs)

      const handleReady = (kit: CodexKitRegistration) => {
        clearTimeout(timeout)
        resolve(kit)
      }

      this.waiters.add(handleReady)
    })
  }

  async assignProject(projectId: string): Promise<CodexKitRegistration> {
    const assignedId = this.projectAssignments.get(projectId)
    if (assignedId) {
      const kit = this.kits.get(assignedId)
      if (kit) return kit
    }

    const kit = await this.waitForAvailableKit()
    this.projectAssignments.set(projectId, kit.kitId)
    return kit
  }

  getAssignedKit(projectId: string): CodexKitRegistration | null {
    const kitId = this.projectAssignments.get(projectId)
    return kitId ? this.kits.get(kitId) ?? null : null
  }

  dispose() {
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
    this.waiters.clear()
  }
}

export interface LocalCodexKitDaemonArgs {
  natsUrl: string
  authToken?: string
  displayName?: string
  settingsIdentity?: string
  kitId?: string
  codexManager?: CodexAppServerManager
}

export class LocalCodexKitDaemon {
  readonly kitId: string

  private readonly manager: CodexAppServerManager
  private readonly js: JetStreamClient
  private readonly registration: CodexKitRegistration
  private readonly activeTurns = new Map<string, ActiveKitTurn>()
  private readonly subscriptions: Subscription[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private disposed = false

  private constructor(
    private readonly nc: NatsConnection,
    args: LocalCodexKitDaemonArgs
  ) {
    this.kitId = args.kitId ?? "kit-local-codex"
    this.js = jetstream(nc)
    this.manager = args.codexManager ?? new CodexAppServerManager()
    this.registration = {
      kitId: this.kitId,
      provider: "codex",
      displayName: args.displayName ?? "Local Codex Kit",
      settingsIdentity: args.settingsIdentity ?? "codex-default",
      registeredAt: Date.now(),
    }
  }

  static async start(args: LocalCodexKitDaemonArgs): Promise<LocalCodexKitDaemon> {
    const nc = await connect({
      servers: args.natsUrl,
      token: args.authToken,
    })
    const daemon = new LocalCodexKitDaemon(nc, args)
    await daemon.initialize()
    return daemon
  }

  private async initialize() {
    this.subscriptions.push(
      this.nc.subscribe(codexKitSessionEnsureSubject(this.kitId)),
      this.nc.subscribe(codexKitTurnStartSubject(this.kitId)),
      this.nc.subscribe(codexKitToolRespondSubject(this.kitId)),
      this.nc.subscribe(codexKitTurnInterruptSubject(this.kitId)),
      this.nc.subscribe(codexKitSessionStopSubject(this.kitId)),
    )

    for (const sub of this.subscriptions) {
      void this.consume(sub)
    }

    this.publishRegistration(codexKitRegisterSubject())
    this.publishRegistration(codexKitHeartbeatSubject(this.kitId))
    this.heartbeatTimer = setInterval(() => {
      this.publishRegistration(codexKitHeartbeatSubject(this.kitId))
    }, 10_000)

    await this.nc.flush()
  }

  private publishRegistration(subject: string) {
    this.nc.publish(subject, encode(this.registration))
  }

  private async consume(sub: Subscription) {
    for await (const msg of sub) {
      await this.handleRequest(msg)
    }
  }

  private respond<T>(msg: Msg, response: KitRequest<T>) {
    msg.respond(encode(response))
  }

  private async handleRequest(msg: Msg) {
    try {
      if (msg.subject === codexKitSessionEnsureSubject(this.kitId)) {
        const payload = msg.json<StartCodexSessionArgs>()
        await this.manager.startSession(payload)
        this.respond(msg, { ok: true, result: null })
        return
      }

      if (msg.subject === codexKitTurnStartSubject(this.kitId)) {
        const payload = msg.json<StartKitTurnRequest>()
        await this.startTurn(payload)
        this.respond(msg, { ok: true, result: null })
        return
      }

      if (msg.subject === codexKitToolRespondSubject(this.kitId)) {
        const payload = msg.json<ToolResponseRequest>()
        const active = this.activeTurns.get(payload.chatId)
        const resolve = active?.pendingToolResponses.get(payload.toolUseId)
        if (!resolve) {
          throw new Error("No pending kit tool request")
        }
        active?.pendingToolResponses.delete(payload.toolUseId)
        resolve(payload.result)
        this.respond(msg, { ok: true, result: null })
        return
      }

      if (msg.subject === codexKitTurnInterruptSubject(this.kitId)) {
        const { chatId } = msg.json<{ chatId: string }>()
        await this.activeTurns.get(chatId)?.turn.interrupt()
        this.respond(msg, { ok: true, result: null })
        return
      }

      if (msg.subject === codexKitSessionStopSubject(this.kitId)) {
        const { chatId } = msg.json<{ chatId: string }>()
        this.manager.stopSession(chatId)
        this.respond(msg, { ok: true, result: null })
      }
    } catch (error) {
      this.respond(msg, { ok: false, error: errorMessage(error) })
    }
  }

  private async startTurn(payload: StartKitTurnRequest) {
    const turn = await this.manager.startTurn({
      chatId: payload.chatId,
      content: payload.content,
      model: payload.model,
      effort: payload.effort,
      serviceTier: payload.serviceTier,
      planMode: payload.planMode,
      skills: payload.skills,
      onToolRequest: async (request) => {
        const active = this.activeTurns.get(payload.chatId)
        if (!active) {
          throw new Error("Kit turn ended unexpectedly")
        }
        this.publishStreamEvent(payload.chatId, {
          type: "tool_request",
          request,
        })
        return await new Promise<unknown>((resolve) => {
          active.pendingToolResponses.set(request.tool.toolId, resolve)
        })
      },
    })

    this.activeTurns.set(payload.chatId, {
      turn,
      pendingToolResponses: new Map(),
    })

    void this.streamTurn(payload.chatId, turn)
  }

  private async publishStreamEvent(chatId: string, envelope: KitStreamEnvelope): Promise<void> {
    try {
      await this.js.publish(codexKitTurnEventsSubject(chatId), encode(envelope))
    } catch (error) {
      console.warn(LOG_PREFIX, `JetStream publish failed for kit turn event: ${errorMessage(error)}`)
    }
  }

  private async streamTurn(chatId: string, turn: HarnessTurn) {
    try {
      for await (const event of turn.stream) {
        // Fire-and-forget for throughput — lost harness events are tolerable
        void this.publishStreamEvent(chatId, {
          type: "harness_event",
          event,
        })
      }
      // Await sentinels — consumer hangs forever if these are lost
      await this.publishStreamEvent(chatId, { type: "stream_end" })
    } catch (error) {
      await this.publishStreamEvent(chatId, {
        type: "stream_error",
        error: errorMessage(error),
      })
    } finally {
      this.activeTurns.delete(chatId)
      turn.close()
    }
  }

  async dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const sub of this.subscriptions) {
      sub.unsubscribe()
    }
    this.manager.stopAll()
    await this.nc.drain()
  }
}

export interface RemoteCodexRuntimeArgs {
  nc: NatsConnection
  registry: ProjectKitRegistry
  requestTimeoutMs?: number
}

export class RemoteCodexRuntime implements CodexRuntime {
  private readonly chatAssignments = new Map<string, string>()
  private readonly requestTimeoutMs: number
  private readonly js: JetStreamClient

  constructor(private readonly args: RemoteCodexRuntimeArgs) {
    this.requestTimeoutMs = args.requestTimeoutMs ?? 30_000
    this.js = jetstream(args.nc)
  }

  private async request<T>(subject: string, payload: unknown): Promise<T> {
    const msg = await this.args.nc.request(subject, encode(payload), {
      timeout: this.requestTimeoutMs,
    })
    const response = msg.json<KitRequest<T>>()
    if (!response.ok) {
      throw new Error(response.error)
    }
    return response.result
  }

  async startSession(args: StartCodexRuntimeSessionArgs): Promise<void> {
    const kit = await this.args.registry.assignProject(args.projectId)
    this.chatAssignments.set(args.chatId, kit.kitId)
    await this.request(codexKitSessionEnsureSubject(kit.kitId), {
      chatId: args.chatId,
      cwd: args.cwd,
      model: args.model,
      serviceTier: args.serviceTier,
      sessionToken: args.sessionToken,
    } satisfies StartCodexSessionArgs)
  }

  async startTurn(args: StartCodexTurnArgs): Promise<HarnessTurn> {
    const kitId = this.chatAssignments.get(args.chatId)
    if (!kitId) {
      throw new Error("Codex chat is not assigned to a kit")
    }

    const queue = new AsyncQueue<KitStreamEnvelope>()

    const consumer = await this.js.consumers.get(KIT_TURN_EVENTS_STREAM, {
      filter_subjects: codexKitTurnEventsSubject(args.chatId),
      deliver_policy: DeliverPolicy.New,
    })
    const messages = await consumer.consume()

    void (async () => {
      try {
        for await (const msg of messages) {
          const envelope = JSON.parse(decoder.decode(msg.data)) as KitStreamEnvelope
          if (envelope.type === "tool_request") {
            const result = await args.onToolRequest(envelope.request)
            await this.request(codexKitToolRespondSubject(kitId), {
              chatId: args.chatId,
              toolUseId: envelope.request.tool.toolId,
              result,
            } satisfies ToolResponseRequest)
            continue
          }

          queue.push(envelope)
          if (envelope.type === "stream_end" || envelope.type === "stream_error") {
            break
          }
        }
      } catch (error) {
        queue.push({
          type: "stream_error",
          error: errorMessage(error),
        })
      } finally {
        await messages.close()
        queue.finish()
      }
    })()

    await this.args.nc.flush()
    await this.request(codexKitTurnStartSubject(kitId), {
      chatId: args.chatId,
      content: args.content,
      model: args.model,
      effort: args.effort,
      serviceTier: args.serviceTier,
      planMode: args.planMode,
      skills: args.skills,
    } satisfies StartKitTurnRequest)

    return {
      provider: "codex",
      stream: this.streamFromQueue(queue),
      interrupt: async () => {
        await this.request(codexKitTurnInterruptSubject(kitId), { chatId: args.chatId })
      },
      close: () => {
        void messages.close()
        queue.finish()
      },
    }
  }

  private async *streamFromQueue(queue: AsyncQueue<KitStreamEnvelope>): AsyncIterable<HarnessEvent> {
    for await (const envelope of queue) {
      if (envelope.type === "harness_event") {
        yield envelope.event
        continue
      }
      if (envelope.type === "stream_error") {
        throw new Error(envelope.error)
      }
      if (envelope.type === "stream_end") {
        return
      }
    }
  }

  stopSession(chatId: string): void {
    const kitId = this.chatAssignments.get(chatId)
    if (!kitId) return
    this.chatAssignments.delete(chatId)
    void this.request(codexKitSessionStopSubject(kitId), { chatId }).catch((error) => {
      console.warn(LOG_PREFIX, `Failed to stop Codex kit session for ${chatId}: ${errorMessage(error)}`)
    })
  }
}
