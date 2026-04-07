import { describe, test, expect, afterEach } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstream, DeliverPolicy } from "@nats-io/jetstream"
import { ensureKitTurnEventsStream, KIT_TURN_EVENTS_STREAM } from "./nats-streams"
import { codexKitTurnEventsSubject } from "../shared/nats-subjects"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

let natsServer: NatsServer | null = null
let nc: NatsConnection | null = null

afterEach(async () => {
  await nc?.drain()
  nc = null
  await natsServer?.stop()
  natsServer = null
})

async function setup() {
  natsServer = await NatsServer.start({ jetstream: true })
  nc = await connect({ servers: natsServer.url })
  await ensureKitTurnEventsStream(nc)
  return nc
}

describe("kit turn events via JetStream", () => {
  test("published events are received by ordered consumer", async () => {
    const conn = await setup()
    const js = jetstream(conn)
    const chatId = "test-chat-1"
    const subject = codexKitTurnEventsSubject(chatId)

    // Create ordered consumer BEFORE publishing
    const consumer = await js.consumers.get(KIT_TURN_EVENTS_STREAM, {
      filter_subjects: subject,
      deliver_policy: DeliverPolicy.New,
    })

    // Publish test events
    const events = [
      { type: "harness_event", event: { kind: "assistant", content: "hello" } },
      { type: "harness_event", event: { kind: "assistant", content: "world" } },
      { type: "stream_end" },
    ]

    for (const event of events) {
      await js.publish(subject, encoder.encode(JSON.stringify(event)))
    }

    // Consume and verify
    const received: unknown[] = []
    const messages = await consumer.consume()
    for await (const msg of messages) {
      const data = JSON.parse(decoder.decode(msg.data))
      received.push(data)
      if (data.type === "stream_end") break
    }
    await messages.close()

    expect(received).toHaveLength(3)
    expect(received[0]).toEqual(events[0])
    expect(received[2]).toEqual({ type: "stream_end" })
  })

  test("events for different chats are filtered correctly", async () => {
    const conn = await setup()
    const js = jetstream(conn)

    const chatId1 = "chat-filter-1"
    const chatId2 = "chat-filter-2"

    // Consumer for chat 1 only
    const consumer = await js.consumers.get(KIT_TURN_EVENTS_STREAM, {
      filter_subjects: codexKitTurnEventsSubject(chatId1),
      deliver_policy: DeliverPolicy.New,
    })

    // Publish to both chats
    await js.publish(
      codexKitTurnEventsSubject(chatId2),
      encoder.encode(JSON.stringify({ type: "harness_event", event: { chat: 2 } }))
    )
    await js.publish(
      codexKitTurnEventsSubject(chatId1),
      encoder.encode(JSON.stringify({ type: "harness_event", event: { chat: 1 } }))
    )
    await js.publish(
      codexKitTurnEventsSubject(chatId1),
      encoder.encode(JSON.stringify({ type: "stream_end" }))
    )

    const received: unknown[] = []
    const messages = await consumer.consume()
    for await (const msg of messages) {
      const data = JSON.parse(decoder.decode(msg.data))
      received.push(data)
      if (data.type === "stream_end") break
    }
    await messages.close()

    // Should only have chat 1 events
    expect(received).toHaveLength(2)
    expect(received[0]).toEqual({ type: "harness_event", event: { chat: 1 } })
  })
})
