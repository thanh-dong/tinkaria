import { jetstream, DeliverPolicy } from "@nats-io/jetstream"
import type { ConsumerMessages } from "@nats-io/jetstream"
import type { NatsConnection } from "@nats-io/transport-node"
import { RUNNER_EVENTS_STREAM, type RunnerTurnEvent } from "../shared/runner-protocol"
import type { SessionStatus, TranscriptEntry, AgentProvider } from "../shared/types"
import { LOG_PREFIX } from "../shared/branding"

const decoder = new TextDecoder()

// ── Store interface (subset of EventStore) ──────────────────────────

export interface TranscriptConsumerStore {
  appendMessage(chatId: string, entry: TranscriptEntry): Promise<void>
  recordTurnFinished(chatId: string): Promise<void>
  recordTurnFailed(chatId: string, error: string): Promise<void>
  recordTurnCancelled(chatId: string): Promise<void>
  setSessionToken(chatId: string, token: string | null): Promise<void>
  renameChat(chatId: string, title: string): Promise<void>
  setChatProvider(chatId: string, provider: AgentProvider): Promise<void>
  setPlanMode(chatId: string, planMode: boolean): Promise<void>
}

// ── Options ─────────────────────────────────────────────────────────

export interface TranscriptConsumerOptions {
  nc: NatsConnection
  store: TranscriptConsumerStore
  onStateChange: () => void
  onMessageAppended?: (chatId: string, entry: TranscriptEntry) => void
}

// ── TranscriptConsumer ──────────────────────────────────────────────

export class TranscriptConsumer {
  private readonly nc: NatsConnection
  private readonly store: TranscriptConsumerStore
  private readonly onStateChange: () => void
  private readonly onMessageAppended: ((chatId: string, entry: TranscriptEntry) => void) | undefined
  private readonly activeStatuses = new Map<string, SessionStatus>()
  private messages: ConsumerMessages | null = null
  private running = false

  constructor(options: TranscriptConsumerOptions) {
    this.nc = options.nc
    this.store = options.store
    this.onStateChange = options.onStateChange
    this.onMessageAppended = options.onMessageAppended
  }

  getActiveStatuses(): Map<string, SessionStatus> {
    return new Map(this.activeStatuses)
  }

  hasActiveChat(chatId: string): boolean {
    return this.activeStatuses.has(chatId)
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    const js = jetstream(this.nc)
    const consumer = await js.consumers.get(RUNNER_EVENTS_STREAM, {
      deliver_policy: DeliverPolicy.New,
    })
    const messages = await consumer.consume()
    this.messages = messages

    // Process messages in the background — don't block start()
    ;(async () => {
      for await (const msg of messages) {
        if (!this.running) break
        try {
          const event = JSON.parse(decoder.decode(msg.data)) as RunnerTurnEvent
          await this.handleEvent(event)
        } catch (err) {
          console.warn(
            LOG_PREFIX,
            "TranscriptConsumer: failed to process event:",
            err instanceof Error ? err.message : String(err),
          )
        }
      }
    })()
  }

  stop(): void {
    this.running = false
    if (this.messages) {
      this.messages.close().catch(() => {})
      this.messages = null
    }
  }

  private async handleEvent(event: RunnerTurnEvent): Promise<void> {
    let stateChanged = true

    switch (event.type) {
      case "transcript":
        await this.store.appendMessage(event.chatId, event.entry)
        this.onMessageAppended?.(event.chatId, event.entry)
        break
      case "turn_finished":
        await this.store.recordTurnFinished(event.chatId)
        this.activeStatuses.delete(event.chatId)
        break
      case "turn_failed":
        await this.store.recordTurnFailed(event.chatId, event.error)
        this.activeStatuses.delete(event.chatId)
        break
      case "turn_cancelled":
        await this.store.recordTurnCancelled(event.chatId)
        this.activeStatuses.delete(event.chatId)
        break
      case "session_token":
        await this.store.setSessionToken(event.chatId, event.sessionToken)
        break
      case "title_generated":
        await this.store.renameChat(event.chatId, event.title)
        break
      case "status_change": {
        const prev = this.activeStatuses.get(event.chatId)
        if (prev === event.status) {
          stateChanged = false
        } else {
          this.activeStatuses.set(event.chatId, event.status)
        }
        break
      }
      case "pending_tool":
        // Trigger state change — UI needs to show pending tool
        break
      case "provider_set":
        await this.store.setChatProvider(event.chatId, event.provider)
        break
      case "plan_mode_set":
        await this.store.setPlanMode(event.chatId, event.planMode)
        break
      case "context_cleared":
        // Already handled by session_token event — no store write needed
        stateChanged = false
        break
    }

    if (stateChanged) {
      this.onStateChange()
    }
  }
}
