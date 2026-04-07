import { describe, test, expect, afterEach } from "bun:test"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstream, DeliverPolicy } from "@nats-io/jetstream"
import { NatsBridge } from "./nats-bridge"
import { ensureChatMessageStream, CHAT_MESSAGE_EVENTS_STREAM } from "./nats-streams"
import { chatMessageSubject } from "../shared/nats-subjects"
import { compressPayload, decompressPayload } from "../shared/compression"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

let bridge: NatsBridge | null = null
let nc: NatsConnection | null = null

afterEach(async () => {
  await nc?.drain()
  nc = null
  if (bridge) {
    await bridge.dispose()
    bridge = null
  }
})

async function setup() {
  bridge = await NatsBridge.create()
  nc = await connect({ servers: bridge.natsUrl })
  await ensureChatMessageStream(nc)
  return nc
}

describe("chat message events via JetStream ordered consumer", () => {
  test("consumer receives events published to JetStream", async () => {
    const conn = await setup()
    const js = jetstream(conn)
    const chatId = "test-chat-js-1"
    const subject = chatMessageSubject(chatId)

    // Create ordered consumer with DeliverPolicy.New
    const consumer = await js.consumers.get(CHAT_MESSAGE_EVENTS_STREAM, {
      filter_subjects: subject,
      deliver_policy: DeliverPolicy.New,
    })

    // Publish events (mimicking server-side publishChatMessage)
    const events = [
      { chatId, entry: { id: "1", kind: "message", content: "hello" } },
      { chatId, entry: { id: "2", kind: "message", content: "world" } },
    ]

    for (const event of events) {
      const payload = compressPayload(encoder.encode(JSON.stringify(event)))
      await js.publish(subject, payload)
    }

    // Consume and verify
    const received: unknown[] = []
    const messages = await consumer.consume()
    for await (const msg of messages) {
      const decoded = await decompressPayload(msg.data)
      const data = JSON.parse(decoder.decode(decoded))
      received.push(data)
      if (received.length >= 2) break
    }
    await messages.close()

    expect(received).toHaveLength(2)
    expect(received[0]).toEqual(events[0])
    expect(received[1]).toEqual(events[1])
  })

  test("consumer filters by chat subject", async () => {
    const conn = await setup()
    const js = jetstream(conn)

    const chatId1 = "chat-js-filter-1"
    const chatId2 = "chat-js-filter-2"

    const consumer = await js.consumers.get(CHAT_MESSAGE_EVENTS_STREAM, {
      filter_subjects: chatMessageSubject(chatId1),
      deliver_policy: DeliverPolicy.New,
    })

    // Publish to chat 2 (should be filtered out)
    await js.publish(
      chatMessageSubject(chatId2),
      encoder.encode(JSON.stringify({ chatId: chatId2, entry: { id: "x" } }))
    )

    // Publish to chat 1 (should be received)
    await js.publish(
      chatMessageSubject(chatId1),
      encoder.encode(JSON.stringify({ chatId: chatId1, entry: { id: "1" } }))
    )

    const messages = await consumer.consume()
    const received: unknown[] = []
    for await (const msg of messages) {
      const data = JSON.parse(decoder.decode(msg.data))
      received.push(data)
      if (received.length >= 1) break
    }
    await messages.close()

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ chatId: chatId1, entry: { id: "1" } })
  })

  test("compressed events are decompressed correctly by consumer", async () => {
    const conn = await setup()
    const js = jetstream(conn)
    const chatId = "test-chat-compress"
    const subject = chatMessageSubject(chatId)

    const consumer = await js.consumers.get(CHAT_MESSAGE_EVENTS_STREAM, {
      filter_subjects: subject,
      deliver_policy: DeliverPolicy.New,
    })

    // Create a large payload that will trigger compression (> 64KB threshold)
    const largeContent = "x".repeat(100_000)
    const event = { chatId, entry: { id: "big", content: largeContent } }
    const payload = compressPayload(encoder.encode(JSON.stringify(event)))

    await js.publish(subject, payload)

    const messages = await consumer.consume()
    for await (const msg of messages) {
      const decoded = await decompressPayload(msg.data)
      const data = JSON.parse(decoder.decode(decoded)) as typeof event
      expect(data.entry.content).toBe(largeContent)
      break
    }
    await messages.close()
  })
})
