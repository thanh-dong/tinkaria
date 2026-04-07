import { wsconnect, type NatsConnection, type Subscription } from "@nats-io/nats-core"
import { jetstream, DeliverPolicy } from "@nats-io/jetstream"
import type { JetStreamClient, ConsumerMessages } from "@nats-io/jetstream"
import type { ClientCommand, SubscriptionTopic, TerminalEvent, TerminalSnapshot } from "../../shared/protocol"
import { snapshotSubject, terminalEventSubject, chatMessageSubject, commandSubject, CHAT_MESSAGE_EVENTS_STREAM_NAME } from "../../shared/nats-subjects"
import { LOG_PREFIX } from "../../shared/branding"
import { decompressPayload } from "../../shared/compression"
import type {
  TinkariaTransport,
  SnapshotListener,
  EventListener,
  SocketStatus,
  StatusListener,
} from "./socket-interface"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface SubscriptionEntry {
  topic: SubscriptionTopic
  natsSubscription: Subscription | null
  eventSubscription: Subscription | null
  consumerMessages: ConsumerMessages | null
  snapshotListener: SnapshotListener<unknown>
  eventListener?: EventListener<unknown>
}

interface NatsCommandResponse {
  ok: boolean
  result?: unknown
  error?: string
}

export class NatsSocket implements TinkariaTransport {
  private resolvedWsUrl: string | null = null
  private nc: NatsConnection | null = null
  private js: JetStreamClient | null = null
  private started = false
  private reconnecting = false
  private readonly subscriptions = new Map<string, SubscriptionEntry>()
  private readonly statusListeners = new Set<StatusListener>()
  private currentStatus: SocketStatus = "disconnected"
  private reconnectTimer: number | null = null
  private reconnectDelayMs = 250
  private resolvedToken: string | undefined = undefined
  private counter = 0

  start(): void {
    if (this.started) return
    this.started = true
    void this.discoverAndConnect()
  }

  private async discoverAndConnect(): Promise<void> {
    try {
      const authRes = await fetch("/auth/token")
      const auth = await authRes.json() as { token?: string }
      this.resolvedToken = auth.token
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      this.resolvedWsUrl = `${protocol}//${window.location.host}/nats-ws`
      void this.connect()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `NATS discovery failed: ${message}`)
      this.emitStatus("disconnected")
      this.scheduleReconnect()
    }
  }

  dispose(): void {
    this.started = false
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.unsubscribeAll()
    if (this.nc) {
      void this.nc.drain().catch(() => {})
      this.nc = null
    }
    this.js = null
    this.emitStatus("disconnected")
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.currentStatus)
    return () => { this.statusListeners.delete(listener) }
  }

  subscribe<TSnapshot, TEvent = never>(
    topic: SubscriptionTopic,
    listener: SnapshotListener<TSnapshot>,
    eventListener?: EventListener<TEvent>
  ): () => void {
    const id = this.nextId()
    const entry: SubscriptionEntry = {
      topic,
      natsSubscription: null,
      eventSubscription: null,
      consumerMessages: null,
      snapshotListener: listener as SnapshotListener<unknown>,
      eventListener: eventListener as EventListener<unknown> | undefined,
    }
    this.subscriptions.set(id, entry)

    if (this.nc) {
      this.activateSubscription(id, entry)
    }

    return () => {
      const e = this.subscriptions.get(id)
      if (e) {
        e.natsSubscription?.unsubscribe()
        e.eventSubscription?.unsubscribe()
        void e.consumerMessages?.close()
        this.subscriptions.delete(id)
        // Notify server to stop tracking this subscription
        if (this.nc) {
          void this.command({ type: "snapshot.unsubscribe", subscriptionId: id }).catch(() => {})
        }
      }
    }
  }

  subscribeTerminal(
    terminalId: string,
    handlers: {
      onSnapshot: SnapshotListener<TerminalSnapshot | null>
      onEvent?: EventListener<TerminalEvent>
    }
  ): () => void {
    return this.subscribe<TerminalSnapshot | null, TerminalEvent>(
      { type: "terminal", terminalId },
      handlers.onSnapshot,
      handlers.onEvent
    )
  }

  async command<TResult = unknown>(command: ClientCommand): Promise<TResult> {
    if (!this.nc) {
      throw new Error("Not connected")
    }

    const subject = commandSubject(command.type)
    const payload = encoder.encode(JSON.stringify(command))
    const reply = await this.nc.request(subject, payload, { timeout: 30_000 })
    const decoded = await decompressPayload(reply.data)
    let response: NatsCommandResponse
    try {
      response = JSON.parse(decoder.decode(decoded))
    } catch {
      throw new Error("Invalid JSON response from server")
    }

    if (!response.ok) {
      throw new Error(response.error ?? "Command failed")
    }

    return response.result as TResult
  }

  ensureHealthyConnection(): Promise<void> {
    if (!this.nc || this.currentStatus !== "connected") {
      void this.reconnectNow()
    }
    return Promise.resolve()
  }

  private async connect(): Promise<void> {
    if (!this.started || !this.resolvedWsUrl) return

    this.emitStatus("connecting")

    try {
      this.nc = await wsconnect({
        servers: this.resolvedWsUrl,
        ...(this.resolvedToken ? { token: this.resolvedToken } : {}),
        maxReconnectAttempts: -1, // infinite reconnect
        reconnectTimeWait: 750,
        pingInterval: 15_000,
        maxPingOut: 3,
      })

      this.js = jetstream(this.nc)
      this.reconnectDelayMs = 750
      this.emitStatus("connected")

      // Activate all pending subscriptions
      for (const [id, entry] of this.subscriptions.entries()) {
        this.activateSubscription(id, entry)
      }

      // Monitor connection status
      void this.monitorStatus()

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `NATS connection failed: ${message}`)
      this.emitStatus("disconnected")
      this.scheduleReconnect()
    }
  }

  private async monitorStatus(): Promise<void> {
    if (!this.nc) return

    try {
      for await (const status of this.nc.status()) {
        if (!this.started) break

        switch (status.type) {
          case "disconnect":
            this.emitStatus("disconnected")
            break
          case "reconnect":
            this.emitStatus("connected")
            // js holds a reference to nc — no need to recreate on reconnect
            // Re-activate subscriptions after reconnect
            for (const [id, entry] of this.subscriptions.entries()) {
              // Close stale JetStream consumers
              if (entry.consumerMessages) {
                void entry.consumerMessages.close()
                entry.consumerMessages = null
              }
              if (!entry.natsSubscription) {
                this.activateSubscription(id, entry)
              }
            }
            break
          case "reconnecting":
            this.emitStatus("connecting")
            break
        }
      }
    } catch {
      // Connection closed
    }

    if (this.started && !this.reconnecting) {
      this.emitStatus("disconnected")
      this.scheduleReconnect()
    }
  }

  private activateSubscription(id: string, entry: SubscriptionEntry): void {
    if (!this.nc) return

    // Subscribe to NATS subject for live updates
    const subject = snapshotSubject(entry.topic)
    entry.natsSubscription = this.nc.subscribe(subject)
    void this.consumeMessages(id, entry.natsSubscription, entry.snapshotListener)

    // Event subscription
    if (entry.topic.type === "terminal" && entry.eventListener) {
      const evtSubject = terminalEventSubject(entry.topic.terminalId)
      entry.eventSubscription = this.nc.subscribe(evtSubject)
      void this.consumeMessages(id, entry.eventSubscription, entry.eventListener)
    } else if (entry.topic.type === "chat" && entry.eventListener && this.js) {
      void this.activateJetStreamConsumer(id, entry)
    }

    // Register with server + fetch initial snapshot
    void this.command({
      type: "snapshot.subscribe",
      subscriptionId: id,
      topic: entry.topic,
    }).then((data) => {
      if (this.subscriptions.has(id)) {
        entry.snapshotListener(data)
      }
    }).catch(() => {
      // Will receive snapshot on next server publish
    })
  }

  private async activateJetStreamConsumer(id: string, entry: SubscriptionEntry): Promise<void> {
    if (!this.js || entry.topic.type !== "chat" || !entry.eventListener) return

    try {
      const consumer = await this.js.consumers.get(CHAT_MESSAGE_EVENTS_STREAM_NAME, {
        filter_subjects: chatMessageSubject(entry.topic.chatId),
        deliver_policy: DeliverPolicy.New,
      })
      const messages = await consumer.consume()
      entry.consumerMessages = messages
      void this.consumeMessages(id, messages, entry.eventListener)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `JetStream consumer failed for chat ${entry.topic.chatId}: ${message}`)
      // Fallback to plain subscription
      const evtSubject = chatMessageSubject(entry.topic.chatId)
      if (this.nc) {
        entry.eventSubscription = this.nc.subscribe(evtSubject)
        void this.consumeMessages(id, entry.eventSubscription, entry.eventListener)
      }
    }
  }

  private async consumeMessages(
    id: string,
    source: AsyncIterable<{ data: Uint8Array }>,
    listener: (data: unknown) => void
  ): Promise<void> {
    try {
      for await (const msg of source) {
        if (!this.subscriptions.has(id)) break
        try {
          const decoded = await decompressPayload(msg.data)
          const data = JSON.parse(decoder.decode(decoded))
          listener(data)
        } catch {
          // Skip malformed messages
        }
      }
    } catch {
      // Source closed
    }
  }

  private unsubscribeAll(): void {
    for (const entry of this.subscriptions.values()) {
      entry.natsSubscription?.unsubscribe()
      entry.eventSubscription?.unsubscribe()
      void entry.consumerMessages?.close()
      entry.natsSubscription = null
      entry.eventSubscription = null
      entry.consumerMessages = null
    }
  }

  private resetConnection(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnecting = false
    this.unsubscribeAll()
    this.nc = null
    this.js = null
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || !this.started) return
    this.reconnecting = true
    this.reconnectTimer = window.setTimeout(() => {
      this.resetConnection()
      void this.discoverAndConnect()
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 3_000)
    }, this.reconnectDelayMs)
  }

  private reconnectNow(): void {
    this.resetConnection()
    void this.connect()
  }

  private emitStatus(status: SocketStatus): void {
    if (this.currentStatus === status) return
    this.currentStatus = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private nextId(): string {
    return `nats-${++this.counter}`
  }
}
