import { describe, test, expect, afterEach } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect } from "@nats-io/transport-node"
import { jetstreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream"
import { Kvm } from "@nats-io/kv"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  runnerCmdSubject,
  RUNNER_EVENTS_STREAM,
  ALL_RUNNER_EVENTS,
  RUNNER_REGISTRY_BUCKET,
  type RunnerRegistration,
} from "../shared/runner-protocol"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe("runner process", () => {
  let server: NatsServer
  let proc: ReturnType<typeof Bun.spawn> | null = null
  let tmpDir: string | null = null

  afterEach(async () => {
    if (proc) {
      proc.kill("SIGTERM")
      await proc.exited
      proc = null
    }
    await server?.stop()
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("starts, registers in KV, and accepts start_turn commands", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-test-"))
    server = await NatsServer.start({ jetstream: true, storeDir: tmpDir })
    const nc = await connect({ servers: server.url })

    // Create required stream
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

    const runnerId = `test-runner-${Date.now()}`
    proc = Bun.spawn(["bun", "run", "src/runner/runner.ts"], {
      env: {
        ...process.env,
        NATS_URL: server.url,
        RUNNER_ID: runnerId,
      },
      stdio: ["ignore", "pipe", "inherit"],
    })

    // Wait for runner to start and register
    await new Promise((r) => setTimeout(r, 1000))

    // Verify KV registration
    const kvm = new Kvm(nc)
    const kvStore = await kvm.open(RUNNER_REGISTRY_BUCKET)
    const entry = await kvStore.get(runnerId)
    expect(entry).toBeDefined()
    const reg = JSON.parse(decoder.decode(entry!.value)) as RunnerRegistration
    expect(reg.runnerId).toBe(runnerId)

    // Verify it responds to commands (start_turn will fail since there's no real Claude API key, but it should respond)
    const reply = await nc.request(
      runnerCmdSubject(runnerId, "start_turn"),
      encoder.encode(JSON.stringify({
        chatId: "test-chat",
        provider: "claude",
        content: "test",
        model: "test-model",
        planMode: false,
        appendUserPrompt: true,
        projectLocalPath: "/tmp",
        sessionToken: null,
        chatTitle: "Test",
        existingMessageCount: 0,
        projectId: "p1",
      })),
      { timeout: 5000 }
    )
    const response = JSON.parse(decoder.decode(reply.data))
    // The start_turn will succeed (the turn factory will fail, but the command handler responds ok before the turn runs)
    expect(response).toHaveProperty("ok")

    await nc.drain()
  })

  test("shuts down cleanly on SIGTERM", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-test-"))
    server = await NatsServer.start({ jetstream: true, storeDir: tmpDir })
    const nc = await connect({ servers: server.url })

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

    proc = Bun.spawn(["bun", "run", "src/runner/runner.ts"], {
      env: {
        ...process.env,
        NATS_URL: server.url,
        RUNNER_ID: "runner-sigterm-test",
      },
      stdio: ["ignore", "pipe", "inherit"],
    })

    await new Promise((r) => setTimeout(r, 500))

    proc.kill("SIGTERM")
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
    proc = null

    await nc.drain()
  })
})
