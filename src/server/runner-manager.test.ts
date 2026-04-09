import { describe, test, expect, afterEach, beforeEach } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { RunnerManager } from "./runner-manager"
import { ensureRunnerEventsStream } from "./nats-streams"

describe("RunnerManager", () => {
  let server: NatsServer
  let nc: NatsConnection

  beforeEach(async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })
    await ensureRunnerEventsStream(nc)
  })

  afterEach(async () => {
    await nc?.drain()
    await server?.stop()
  })

  test("ensureRunner spawns runner and returns runnerId", async () => {
    const mgr = new RunnerManager({ nc, natsUrl: server.url })
    try {
      const runnerId = await mgr.ensureRunner()
      expect(runnerId).toBeDefined()
      expect(typeof runnerId).toBe("string")
      expect(runnerId).toContain("runner-")
    } finally {
      await mgr.dispose()
    }
  }, 30_000)

  test("ensureRunner reuses existing runner", async () => {
    const mgr = new RunnerManager({ nc, natsUrl: server.url })
    try {
      const id1 = await mgr.ensureRunner()
      const id2 = await mgr.ensureRunner()
      expect(id1).toBe(id2)
      expect(mgr.getReadiness().ok).toBe(true)
    } finally {
      await mgr.dispose()
    }
  }, 30_000)

  test("getReadiness reports registration and heartbeat after startup", async () => {
    const mgr = new RunnerManager({ nc, natsUrl: server.url })
    try {
      await mgr.ensureRunner()
      expect(mgr.getReadiness()).toMatchObject({
        ok: true,
        registered: true,
        heartbeatFresh: true,
      })
    } finally {
      await mgr.dispose()
    }
  }, 30_000)

  test("dispose stops runner process", async () => {
    const mgr = new RunnerManager({ nc, natsUrl: server.url })
    await mgr.ensureRunner()
    await mgr.dispose()
    // After dispose, getRunnerId should throw
    expect(() => mgr.getRunnerId()).toThrow("Runner not started")
  }, 30_000)

  test("getRunnerId throws before runner is started", () => {
    const mgr = new RunnerManager({ nc, natsUrl: server.url })
    expect(() => mgr.getRunnerId()).toThrow("Runner not started")
  })
})
