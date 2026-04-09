import { afterEach, describe, test, expect } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstreamManager } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import {
  ensureTerminalEventsStream,
  TERMINAL_EVENTS_STREAM,
} from "./nats-streams"
import { KV_BUCKET, snapshotKvKey } from "../shared/nats-subjects"

let server: NatsServer | null = null
let nc: NatsConnection | null = null

afterEach(async () => {
  if (nc) {
    await nc.drain()
    nc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
})

describe("nats-streams", () => {
  test("ensureTerminalEventsStream creates the stream", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    await ensureTerminalEventsStream(nc)

    const jsm = await jetstreamManager(nc)
    const info = await jsm.streams.info(TERMINAL_EVENTS_STREAM)
    expect(info.config.name).toBe(TERMINAL_EVENTS_STREAM)
    expect(info.config.subjects).toContain("runtime.evt.terminal.>")
    expect(info.config.storage).toBe("memory")
  })

  test("ensureTerminalEventsStream is idempotent", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    await ensureTerminalEventsStream(nc)
    await ensureTerminalEventsStream(nc)

    const jsm = await jetstreamManager(nc)
    const info = await jsm.streams.info(TERMINAL_EVENTS_STREAM)
    expect(info.config.name).toBe(TERMINAL_EVENTS_STREAM)
  })

  test("stream retains published terminal events", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    await ensureTerminalEventsStream(nc)

    const jsm = await jetstreamManager(nc)
    const encoder = new TextEncoder()

    // Publish a terminal event
    const { jetstream } = await import("@nats-io/jetstream")
    const js = jetstream(nc)
    await js.publish(
      "runtime.evt.terminal.term-1",
      encoder.encode(JSON.stringify({ type: "terminal.output", terminalId: "term-1", data: "hello" }))
    )

    const info = await jsm.streams.info(TERMINAL_EVENTS_STREAM)
    expect(info.state.messages).toBe(1)
  })
})

describe("KV snapshot bucket", () => {
  test("can create and read from runtime_snapshots bucket", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const kvm = new Kvm(nc)
    const kv = await kvm.create(KV_BUCKET)
    const encoder = new TextEncoder()

    await kv.put("sidebar", encoder.encode(JSON.stringify({ projectGroups: [] })))
    const entry = await kv.get("sidebar")
    expect(entry).not.toBeNull()
    expect(entry!.json() as Record<string, unknown>).toEqual({ projectGroups: [] })
  })

  test("kv dedup: identical puts create new revisions", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const kvm = new Kvm(nc)
    const kv = await kvm.create(KV_BUCKET)
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify({ test: true }))

    const rev1 = await kv.put("test-key", data)
    const rev2 = await kv.put("test-key", data)
    // NATS KV creates new revision even for identical values
    // (server-side dedup in publisher prevents this)
    expect(rev2).toBeGreaterThan(rev1)
  })

  test("snapshotKvKey maps topics correctly", () => {
    expect(snapshotKvKey({ type: "sidebar" })).toBe("sidebar")
    expect(snapshotKvKey({ type: "local-projects" })).toBe("local-projects")
    expect(snapshotKvKey({ type: "chat", chatId: "abc" })).toBe("chat.abc")
    expect(snapshotKvKey({ type: "terminal", terminalId: "t1" })).toBe("terminal.t1")
  })
})

