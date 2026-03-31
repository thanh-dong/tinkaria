import { afterEach, describe, test, expect } from "bun:test"
import { NatsBridge } from "./nats-bridge"
import { connect } from "@nats-io/transport-node"

const decoder = new TextDecoder()
let bridge: NatsBridge | null = null

afterEach(async () => {
  if (bridge) {
    await bridge.dispose()
    bridge = null
  }
})

describe("NatsBridge", () => {
  test("create() starts NATS server and connects", async () => {
    bridge = await NatsBridge.create()
    expect(bridge.natsUrl).toMatch(/^nats:\/\/127\.0\.0\.1:\d+$/)
    expect(bridge.natsWsUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/)
    expect(bridge.natsWsPort).toBeGreaterThan(0)
  })

  test("publish() delivers message to subscriber", async () => {
    bridge = await NatsBridge.create()

    // Connect a test subscriber
    const testClient = await connect({ servers: bridge.natsUrl })
    const sub = testClient.subscribe("test.subject")

    // Publish via bridge
    bridge.publish("test.subject", { hello: "world" })

    // Receive message
    const msg = await (async () => {
      for await (const m of sub) {
        return JSON.parse(decoder.decode(m.data))
      }
    })()

    expect(msg).toEqual({ hello: "world" })

    await testClient.drain()
  })

  test("publish() handles multiple subjects", async () => {
    bridge = await NatsBridge.create()

    const testClient = await connect({ servers: bridge.natsUrl })
    const received: Array<{ subject: string; data: unknown }> = []

    const sub1 = testClient.subscribe("kanna.snap.sidebar")
    const sub2 = testClient.subscribe("kanna.snap.chat.abc")

    // Collect in background
    const collect = async (sub: AsyncIterable<{ data: Uint8Array; subject: string }>, count: number) => {
      let n = 0
      for await (const m of sub) {
        received.push({ subject: m.subject, data: JSON.parse(decoder.decode(m.data)) })
        if (++n >= count) break
      }
    }

    const p1 = collect(sub1, 1)
    const p2 = collect(sub2, 1)

    // Small delay to let subscriptions establish
    await new Promise((r) => setTimeout(r, 50))

    bridge.publish("kanna.snap.sidebar", { type: "sidebar" })
    bridge.publish("kanna.snap.chat.abc", { type: "chat", chatId: "abc" })

    await Promise.all([p1, p2])

    expect(received).toHaveLength(2)
    expect(received.find((r) => r.subject === "kanna.snap.sidebar")?.data).toEqual({ type: "sidebar" })
    expect(received.find((r) => r.subject === "kanna.snap.chat.abc")?.data).toEqual({ type: "chat", chatId: "abc" })

    await testClient.drain()
  })

  test("dispose() cleanly stops NATS server", async () => {
    bridge = await NatsBridge.create()
    const url = bridge.natsUrl

    await bridge.dispose()
    bridge = null

    // Connection to stopped server should fail
    try {
      await connect({ servers: url, maxReconnectAttempts: 0, reconnect: false })
      expect(true).toBe(false) // should not reach
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  test("wildcard subscription receives matching messages", async () => {
    bridge = await NatsBridge.create()

    const testClient = await connect({ servers: bridge.natsUrl })
    const received: string[] = []

    const sub = testClient.subscribe("kanna.snap.>")

    const collect = async (count: number) => {
      let n = 0
      for await (const m of sub) {
        received.push(m.subject)
        if (++n >= count) break
      }
    }

    const p = collect(3)
    await new Promise((r) => setTimeout(r, 50))

    bridge.publish("kanna.snap.sidebar", {})
    bridge.publish("kanna.snap.update", {})
    bridge.publish("kanna.snap.chat.xyz", {})

    await p

    expect(received).toContain("kanna.snap.sidebar")
    expect(received).toContain("kanna.snap.update")
    expect(received).toContain("kanna.snap.chat.xyz")

    await testClient.drain()
  })
})
