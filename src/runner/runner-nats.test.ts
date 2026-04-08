import { describe, test, expect, afterEach, beforeEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import { RunnerNatsHandler } from "./runner-nats"
import { RunnerAgent, type TurnFactory } from "./runner-agent"
import {
  runnerCmdSubject,
  runnerHeartbeatSubject,
  RUNNER_EVENTS_STREAM,
  ALL_RUNNER_EVENTS,
  RUNNER_REGISTRY_BUCKET,
  type StartTurnCommand,
  type CancelTurnCommand,
  type RunnerRegistration,
} from "../shared/runner-protocol"
import type { HarnessEvent, HarnessTurn } from "../shared/harness-types"
import type { TranscriptEntry } from "../shared/types"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function ts<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

function createMockTurn(events: HarnessEvent[]): HarnessTurn {
  let interrupted = false
  return {
    provider: "claude",
    stream: (async function* () {
      for (const event of events) {
        if (interrupted) return
        yield event
      }
    })(),
    interrupt: async () => { interrupted = true },
    close: () => {},
  }
}

describe("RunnerNatsHandler", () => {
  let server: NatsServer
  let nc: NatsConnection
  let handlerNc: NatsConnection
  let tmpDir: string | null = null

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-test-"))
    server = await NatsServer.start({ jetstream: true, storeDir: tmpDir })
    nc = await connect({ servers: server.url })
    handlerNc = await connect({ servers: server.url })
    const jsm = await jetstreamManager(nc)
    await jsm.streams.add({
      name: RUNNER_EVENTS_STREAM,
      subjects: [ALL_RUNNER_EVENTS],
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_age: 5 * 60 * 1_000_000_000,
      max_msgs: 10_000,
      max_bytes: 64 * 1024 * 1024,
    })
  })

  afterEach(async () => {
    await nc?.drain()
    await handlerNc?.drain()
    await server?.stop()
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("subscribes to start_turn and dispatches to RunnerAgent", async () => {
    let turnStarted = false
    const turnFactory: TurnFactory = async () => {
      turnStarted = true
      return createMockTurn([
        { type: "transcript", entry: ts({ kind: "result", subtype: "success", isError: false, durationMs: 10, result: "ok" }) },
      ])
    }

    const agent = new RunnerAgent({ nc: handlerNc, createTurn: turnFactory })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1" })
    await handler.start()

    const cmd: StartTurnCommand = {
      chatId: "chat-1",
      provider: "claude",
      content: "hello",
      model: "test-model",
      planMode: false,
      appendUserPrompt: true,
      projectLocalPath: "/tmp",
      sessionToken: null,
      chatTitle: "New Chat",
      existingMessageCount: 0,
      projectId: "p1",
    }

    const reply = await nc.request(
      runnerCmdSubject("r1", "start_turn"),
      encoder.encode(JSON.stringify(cmd)),
      { timeout: 2000 }
    )
    const response = JSON.parse(decoder.decode(reply.data))
    expect(response.ok).toBe(true)

    await new Promise((r) => setTimeout(r, 200))
    expect(turnStarted).toBe(true)

    handler.dispose()
  })

  test("subscribes to cancel_turn and dispatches to RunnerAgent", async () => {
    let unblock: (() => void) | null = null
    const turnFactory: TurnFactory = async () => ({
      provider: "claude",
      stream: (async function* () {
        yield { type: "transcript" as const, entry: ts({ kind: "system_init", provider: "claude", model: "t", tools: [], agents: [], slashCommands: [], mcpServers: [] }) }
        await new Promise<void>((r) => { unblock = r })
      })(),
      interrupt: async () => { unblock?.() },
      close: () => {},
    })

    const agent = new RunnerAgent({ nc: handlerNc, createTurn: turnFactory })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1" })
    await handler.start()

    const startCmd: StartTurnCommand = {
      chatId: "chat-1", provider: "claude", content: "hello", model: "m",
      planMode: false, appendUserPrompt: true, projectLocalPath: "/tmp",
      sessionToken: null, chatTitle: "New Chat", existingMessageCount: 0, projectId: "p1",
    }
    await nc.request(runnerCmdSubject("r1", "start_turn"), encoder.encode(JSON.stringify(startCmd)), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 100))

    const cancelCmd: CancelTurnCommand = { chatId: "chat-1" }
    const reply = await nc.request(
      runnerCmdSubject("r1", "cancel_turn"),
      encoder.encode(JSON.stringify(cancelCmd)),
      { timeout: 2000 }
    )
    const response = JSON.parse(decoder.decode(reply.data))
    expect(response.ok).toBe(true)

    await new Promise((r) => setTimeout(r, 200))
    expect(agent.activeTurns.has("chat-1")).toBe(false)

    handler.dispose()
  })

  test("publishes heartbeat periodically", async () => {
    const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1", heartbeatIntervalMs: 100 })
    await handler.start()

    const heartbeats: unknown[] = []
    const sub = nc.subscribe(runnerHeartbeatSubject("r1"))
    void (async () => {
      for await (const msg of sub) {
        heartbeats.push(JSON.parse(decoder.decode(msg.data)))
      }
    })()

    await new Promise((r) => setTimeout(r, 350))
    expect(heartbeats.length).toBeGreaterThanOrEqual(2)

    sub.unsubscribe()
    handler.dispose()
  })

  test("registers in KV bucket on start", async () => {
    const agent = new RunnerAgent({ nc: handlerNc, createTurn: async () => createMockTurn([]) })
    const handler = new RunnerNatsHandler({ nc: handlerNc, agent, runnerId: "r1" })
    await handler.start()

    // Read from KV using the client connection
    const kvm = new Kvm(nc)
    const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
    const entry = await kvStore.get("r1")
    expect(entry).toBeDefined()
    const registration = JSON.parse(decoder.decode(entry!.value)) as RunnerRegistration
    expect(registration.runnerId).toBe("r1")
    expect(registration.pid).toBe(process.pid)

    handler.dispose()
  })
})
