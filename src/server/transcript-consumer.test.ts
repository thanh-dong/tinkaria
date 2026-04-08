import { afterEach, describe, expect, test } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstream } from "@nats-io/jetstream"
import { ensureRunnerEventsStream } from "./nats-streams"
import { runnerEventsSubject } from "../shared/runner-protocol"
import { TranscriptConsumer, type TranscriptConsumerStore } from "./transcript-consumer"
import type { TranscriptEntry, TinkariaStatus, AgentProvider } from "../shared/types"

const encoder = new TextEncoder()

let server: NatsServer | null = null
let nc: NatsConnection | null = null
let consumer: TranscriptConsumer | null = null

afterEach(async () => {
  if (consumer) {
    consumer.stop()
    consumer = null
  }
  if (nc) {
    await nc.drain()
    nc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
})

async function setup() {
  server = await NatsServer.start({ jetstream: true })
  nc = await connect({ servers: server.url })
  await ensureRunnerEventsStream(nc)
  return nc
}

function makeStore(): TranscriptConsumerStore & {
  calls: { method: string; args: unknown[] }[]
} {
  const calls: { method: string; args: unknown[] }[] = []
  return {
    calls,
    async appendMessage(chatId: string, entry: TranscriptEntry) {
      calls.push({ method: "appendMessage", args: [chatId, entry] })
    },
    async recordTurnFinished(chatId: string) {
      calls.push({ method: "recordTurnFinished", args: [chatId] })
    },
    async recordTurnFailed(chatId: string, error: string) {
      calls.push({ method: "recordTurnFailed", args: [chatId, error] })
    },
    async recordTurnCancelled(chatId: string) {
      calls.push({ method: "recordTurnCancelled", args: [chatId] })
    },
    async setSessionToken(chatId: string, token: string | null) {
      calls.push({ method: "setSessionToken", args: [chatId, token] })
    },
    async renameChat(chatId: string, title: string) {
      calls.push({ method: "renameChat", args: [chatId, title] })
    },
    async setChatProvider(chatId: string, provider: AgentProvider) {
      calls.push({ method: "setChatProvider", args: [chatId, provider] })
    },
    async setPlanMode(chatId: string, planMode: boolean) {
      calls.push({ method: "setPlanMode", args: [chatId, planMode] })
    },
  }
}

async function publishEvent(conn: NatsConnection, chatId: string, event: Record<string, unknown>) {
  const js = jetstream(conn)
  const subject = runnerEventsSubject(chatId)
  await js.publish(subject, encoder.encode(JSON.stringify({ ...event, chatId })))
}

/** Wait until the predicate returns true, polling every intervalMs. Throws after timeoutMs. */
async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor timeout")
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

describe("TranscriptConsumer", () => {
  test("transcript event calls store.appendMessage and onMessageAppended", async () => {
    const conn = await setup()
    const store = makeStore()
    const appended: { chatId: string; entry: TranscriptEntry }[] = []

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => {},
      onMessageAppended: (chatId, entry) => appended.push({ chatId, entry }),
    })
    await consumer.start()

    const entry: TranscriptEntry = { _id: "msg-1", createdAt: Date.now(), kind: "assistant_text", text: "hello" }
    await publishEvent(conn, "chat-1", { type: "transcript", entry })

    await waitFor(() => store.calls.length >= 1)
    expect(store.calls[0]).toEqual({ method: "appendMessage", args: ["chat-1", entry] })
    expect(appended).toHaveLength(1)
    expect(appended[0]!.chatId).toBe("chat-1")
    expect(appended[0]!.entry).toEqual(entry)
  })

  test("turn_finished calls store.recordTurnFinished and removes from activeStatuses", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    // First set a status so there's something to remove
    await publishEvent(conn, "chat-2", { type: "status_change", status: "running" satisfies TinkariaStatus })
    await waitFor(() => stateChanges >= 1)
    expect(consumer.getActiveStatuses().get("chat-2")).toBe("running")

    // Now finish
    await publishEvent(conn, "chat-2", { type: "turn_finished" })
    await waitFor(() => store.calls.some((c) => c.method === "recordTurnFinished"))
    expect(store.calls.find((c) => c.method === "recordTurnFinished")).toEqual({
      method: "recordTurnFinished",
      args: ["chat-2"],
    })
    expect(consumer.getActiveStatuses().has("chat-2")).toBe(false)
  })

  test("turn_failed calls store.recordTurnFailed and removes from activeStatuses", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    await publishEvent(conn, "chat-3", { type: "status_change", status: "running" satisfies TinkariaStatus })
    await waitFor(() => stateChanges >= 1)

    await publishEvent(conn, "chat-3", { type: "turn_failed", error: "something broke" })
    await waitFor(() => store.calls.some((c) => c.method === "recordTurnFailed"))
    expect(store.calls.find((c) => c.method === "recordTurnFailed")).toEqual({
      method: "recordTurnFailed",
      args: ["chat-3", "something broke"],
    })
    expect(consumer.getActiveStatuses().has("chat-3")).toBe(false)
  })

  test("turn_cancelled calls store.recordTurnCancelled and removes from activeStatuses", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    await publishEvent(conn, "chat-4", { type: "status_change", status: "running" satisfies TinkariaStatus })
    await waitFor(() => stateChanges >= 1)

    await publishEvent(conn, "chat-4", { type: "turn_cancelled" })
    await waitFor(() => store.calls.some((c) => c.method === "recordTurnCancelled"))
    expect(store.calls.find((c) => c.method === "recordTurnCancelled")).toEqual({
      method: "recordTurnCancelled",
      args: ["chat-4"],
    })
    expect(consumer.getActiveStatuses().has("chat-4")).toBe(false)
  })

  test("session_token calls store.setSessionToken", async () => {
    const conn = await setup()
    const store = makeStore()

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => {},
    })
    await consumer.start()

    await publishEvent(conn, "chat-5", { type: "session_token", sessionToken: "tok-abc" })
    await waitFor(() => store.calls.some((c) => c.method === "setSessionToken"))
    expect(store.calls.find((c) => c.method === "setSessionToken")).toEqual({
      method: "setSessionToken",
      args: ["chat-5", "tok-abc"],
    })
  })

  test("title_generated calls store.renameChat", async () => {
    const conn = await setup()
    const store = makeStore()

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => {},
    })
    await consumer.start()

    await publishEvent(conn, "chat-6", { type: "title_generated", title: "My Chat Title" })
    await waitFor(() => store.calls.some((c) => c.method === "renameChat"))
    expect(store.calls.find((c) => c.method === "renameChat")).toEqual({
      method: "renameChat",
      args: ["chat-6", "My Chat Title"],
    })
  })

  test("status_change updates activeStatuses", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    await publishEvent(conn, "chat-7", { type: "status_change", status: "running" satisfies TinkariaStatus })
    await waitFor(() => stateChanges >= 1)
    expect(consumer.getActiveStatuses().get("chat-7")).toBe("running")

    await publishEvent(conn, "chat-7", { type: "status_change", status: "waiting_for_user" satisfies TinkariaStatus })
    await waitFor(() => stateChanges >= 2)
    expect(consumer.getActiveStatuses().get("chat-7")).toBe("waiting_for_user")
  })

  test("provider_set calls store.setChatProvider", async () => {
    const conn = await setup()
    const store = makeStore()

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => {},
    })
    await consumer.start()

    await publishEvent(conn, "chat-8", { type: "provider_set", provider: "claude" })
    await waitFor(() => store.calls.some((c) => c.method === "setChatProvider"))
    expect(store.calls.find((c) => c.method === "setChatProvider")).toEqual({
      method: "setChatProvider",
      args: ["chat-8", "claude"],
    })
  })

  test("plan_mode_set calls store.setPlanMode", async () => {
    const conn = await setup()
    const store = makeStore()

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => {},
    })
    await consumer.start()

    await publishEvent(conn, "chat-9", { type: "plan_mode_set", planMode: true })
    await waitFor(() => store.calls.some((c) => c.method === "setPlanMode"))
    expect(store.calls.find((c) => c.method === "setPlanMode")).toEqual({
      method: "setPlanMode",
      args: ["chat-9", true],
    })
  })

  test("every event triggers onStateChange", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    const entry: TranscriptEntry = { _id: "msg-x", createdAt: Date.now(), kind: "assistant_text", text: "hi" }
    await publishEvent(conn, "chat-x", { type: "transcript", entry })
    await publishEvent(conn, "chat-x", { type: "status_change", status: "running" satisfies TinkariaStatus })
    await publishEvent(conn, "chat-x", { type: "turn_finished" })

    await waitFor(() => stateChanges >= 3)
    expect(stateChanges).toBeGreaterThanOrEqual(3)
  })

  test("pending_tool event triggers onStateChange without store call", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    await publishEvent(conn, "chat-pt", { type: "pending_tool", tool: { toolUseId: "t1", toolKind: "ask_user_question" } })
    await waitFor(() => stateChanges >= 1)
    // No store method called for pending_tool
    expect(store.calls).toHaveLength(0)
  })

  test("context_cleared event does not trigger onStateChange (handled by session_token)", async () => {
    const conn = await setup()
    const store = makeStore()
    let stateChanges = 0

    consumer = new TranscriptConsumer({
      nc: conn,
      store,
      onStateChange: () => { stateChanges++ },
    })
    await consumer.start()

    await publishEvent(conn, "chat-cc", { type: "context_cleared" })
    // Give consumer time to process — but state should NOT change
    await new Promise(r => setTimeout(r, 200))
    expect(stateChanges).toBe(0)
    expect(store.calls).toHaveLength(0)
  })
})
