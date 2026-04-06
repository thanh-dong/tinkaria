import { afterEach, describe, test, expect, mock } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection, type Subscription } from "@nats-io/transport-node"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createNatsPublisher, type CreateNatsPublisherArgs } from "./nats-publisher"
import { snapshotSubject, snapshotKvKey, KV_BUCKET } from "../shared/nats-subjects"
import { createEmptyState } from "./events"
import { Kvm } from "@nats-io/kv"
import type { SubscriptionTopic } from "../shared/protocol"
import { EventStore } from "./event-store"

let server: NatsServer | null = null
let nc: NatsConnection | null = null
const tempDirs: string[] = []
const originalHome = process.env.HOME

afterEach(async () => {
  if (nc) {
    await nc.drain()
    nc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
  process.env.HOME = originalHome
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeTempDir(prefix = "tinkaria-nats-publisher-") {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function encodeClaudeProjectDir(projectPath: string, homeDir: string) {
  return join(homeDir, ".claude", "projects", projectPath.replace(/\//g, "-"))
}

function mockArgs(overrides: Partial<CreateNatsPublisherArgs> = {}): CreateNatsPublisherArgs {
  return {
    nc: nc!,
    store: {
      state: createEmptyState(),
      getMessages: () => [],
    } as unknown as CreateNatsPublisherArgs["store"],
    agent: {
      getActiveStatuses: () => new Map(),
    } as unknown as CreateNatsPublisherArgs["agent"],
    terminals: {
      getSnapshot: () => null,
      onEvent: () => () => {},
    } as unknown as CreateNatsPublisherArgs["terminals"],
    refreshDiscovery: async () => [],
    getDiscoveredProjects: () => [],
    machineDisplayName: "test-machine",
    updateManager: null,
    ...overrides,
  }
}

async function collectMessages(sub: Subscription, count: number, timeoutMs = 500): Promise<string[]> {
  const messages: string[] = []
  const decoder = new TextDecoder()
  const timeout = setTimeout(() => sub.unsubscribe(), timeoutMs)

  for await (const msg of sub) {
    messages.push(decoder.decode(msg.data))
    if (messages.length >= count) {
      clearTimeout(timeout)
      sub.unsubscribe()
      break
    }
  }
  clearTimeout(timeout)
  return messages
}

describe("createNatsPublisher", () => {
  test("publishes snapshot to NATS subject", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }
    const sub = nc.subscribe(snapshotSubject(topic))

    publisher.addSubscription("sub-1", topic)
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)

    const data = JSON.parse(msgs[0])
    expect(data).toHaveProperty("projectGroups")

    publisher.dispose()
  })

  test("dedup skips identical publishes", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }
    const sub = nc.subscribe(snapshotSubject(topic))

    // First publish delivers
    publisher.getSnapshot(topic)
    // Second publish with same data is skipped
    publisher.getSnapshot(topic)
    await nc.flush()

    const msgs = await collectMessages(sub, 2, 200)
    // Only 1 message should arrive due to dedup
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("writes snapshot to KV bucket", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }

    publisher.getSnapshot(topic)
    await nc.flush()
    // Give async KV put time to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    const kvm = new Kvm(nc)
    const kv = await kvm.create(KV_BUCKET)
    const entry = await kv.get(snapshotKvKey(topic))
    expect(entry).not.toBeNull()

    const data = entry!.json() as Record<string, unknown>
    expect(data).toHaveProperty("projectGroups")

    publisher.dispose()
  })

  test("broadcastSnapshots publishes for all active subscriptions", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())

    publisher.addSubscription("sub-1", { type: "sidebar" })
    publisher.addSubscription("sub-2", { type: "local-projects" })

    const sidebarSub = nc.subscribe(snapshotSubject({ type: "sidebar" }))
    const localProjectsSub = nc.subscribe(snapshotSubject({ type: "local-projects" }))

    publisher.broadcastSnapshots()

    const [sidebarMsgs, localProjectsMsgs] = await Promise.all([
      collectMessages(sidebarSub, 1),
      collectMessages(localProjectsSub, 1),
    ])

    expect(sidebarMsgs.length).toBe(1)
    expect(localProjectsMsgs.length).toBe(1)

    publisher.dispose()
  })

  test("broadcastSnapshots deduplicates same topic from multiple subscriptions", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())

    // Two subscriptions for same topic
    publisher.addSubscription("sub-1", { type: "sidebar" })
    publisher.addSubscription("sub-2", { type: "sidebar" })

    const sub = nc.subscribe(snapshotSubject({ type: "sidebar" }))

    publisher.broadcastSnapshots()
    await nc.flush()

    const msgs = await collectMessages(sub, 2, 200)
    // Only 1 publish even though 2 subscriptions watch sidebar
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("removeSubscription prunes dedup cache when last subscriber leaves", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }

    // Subscribe and get initial snapshot (seeds dedup cache)
    publisher.addSubscription("sub-1", topic)
    publisher.getSnapshot(topic)

    const sub = nc.subscribe(snapshotSubject(topic))

    // Remove subscription → dedup cache pruned
    publisher.removeSubscription("sub-1")

    // Re-subscribe → getSnapshot should publish again (cache was pruned)
    publisher.addSubscription("sub-2", topic)
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("terminal events forwarded via JetStream", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const eventCallbacks: Array<(event: unknown) => void> = []
    const terminals = {
      getSnapshot: () => null,
      onEvent: (cb: (event: unknown) => void) => {
        eventCallbacks.push(cb)
        return () => {}
      },
    } as unknown as CreateNatsPublisherArgs["terminals"]

    // Need the terminal events stream for JetStream publish
    const { ensureTerminalEventsStream } = await import("./nats-streams")
    await ensureTerminalEventsStream(nc)

    const publisher = await createNatsPublisher(mockArgs({ terminals }))

    const sub = nc.subscribe("runtime.evt.terminal.term-1")

    // Simulate terminal event
    for (const cb of eventCallbacks) {
      cb({ type: "terminal.output", terminalId: "term-1", data: "hello" })
    }

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)
    const event = JSON.parse(msgs[0])
    expect(event.terminalId).toBe("term-1")

    publisher.dispose()
  })

  test("failed publish does not poison dedup cache — retry delivers", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const publisher = await createNatsPublisher(mockArgs())
    const topic: SubscriptionTopic = { type: "sidebar" }
    const subject = snapshotSubject(topic)

    // Monkey-patch nc.publish to throw only for the snapshot subject
    const realPublish = nc.publish.bind(nc)
    let shouldFail = true
    nc.publish = (subj: string, ...rest: unknown[]) => {
      if (subj === subject && shouldFail) {
        shouldFail = false
        throw new Error("simulated max_payload exceeded")
      }
      return (realPublish as Function)(subj, ...rest)
    }

    // First getSnapshot — snapshot publish fails, cache should NOT be poisoned
    publisher.getSnapshot(topic)

    // Restore real publish and subscribe to verify retry
    nc.publish = realPublish
    const sub = nc.subscribe(subject)

    // Second getSnapshot with same data — should retry because cache was not poisoned
    publisher.getSnapshot(topic)

    const msgs = await collectMessages(sub, 1)
    expect(msgs.length).toBe(1)

    publisher.dispose()
  })

  test("dispose stops terminal event forwarding", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const disposeFn = mock(() => {})
    const terminals = {
      getSnapshot: () => null,
      onEvent: () => disposeFn,
    } as unknown as CreateNatsPublisherArgs["terminals"]

    const publisher = await createNatsPublisher(mockArgs({ terminals }))
    publisher.dispose()

    expect(disposeFn).toHaveBeenCalledTimes(1)
  })

  test("refreshSessions discovers Claude CLI history from the shared encoded project path", async () => {
    server = await NatsServer.start({ jetstream: true })
    nc = await connect({ servers: server.url })

    const homeDir = await makeTempDir("tinkaria-home-")
    process.env.HOME = homeDir

    const storeDir = await makeTempDir("tinkaria-store-")
    const store = new EventStore(storeDir)
    await store.initialize()

    const projectPath = "/home/user/dev/kanna"
    const project = await store.openProject(projectPath, "kanna")

    const claudeDir = encodeClaudeProjectDir(projectPath, homeDir)
    await mkdir(claudeDir, { recursive: true })
    await writeFile(
      join(claudeDir, "cli-session.jsonl"),
      [
        JSON.stringify({ type: "user", message: { content: "Audit the old session history" } }),
        JSON.stringify({ type: "assistant", message: { content: "Found the bug." } }),
      ].join("\n") + "\n"
    )

    const publisher = await createNatsPublisher(mockArgs({ store }))
    await publisher.refreshSessions(project.id, projectPath)

    const snapshot = publisher.getSnapshot({ type: "sessions", projectId: project.id }) as { sessions: Array<{ sessionId: string, source: string }> }

    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]).toMatchObject({
      sessionId: "cli-session",
      source: "cli",
    })

    publisher.dispose()
  })
})
