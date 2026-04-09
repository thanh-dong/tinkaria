#!/usr/bin/env bun
/**
 * NATS Communication Performance Baseline
 *
 * Measures the hot paths in Runner → NATS → Server → Client communication:
 * 1. Raw NATS pub/sub latency (baseline transport)
 * 2. JetStream publish + consume latency
 * 3. JSON serialization/deserialization overhead
 * 4. Compression overhead at various payload sizes
 * 5. Snapshot derivation + dedup cost
 * 6. Full pipeline: event → TranscriptConsumer → broadcastSnapshots()
 *
 * Usage: bun scripts/perf-nats-baseline.ts [--json]
 */
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { jetstream, jetstreamManager, RetentionPolicy, StorageType, DeliverPolicy } from "@nats-io/jetstream"
import type { JetStreamClient } from "@nats-io/jetstream"
import { compressPayload, decompressPayload } from "../src/shared/compression"
import type { TranscriptEntry } from "../src/shared/types"

const JSON_FLAG = process.argv.includes("--json")
const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ── Helpers ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function stats(measurements: number[]) {
  const sorted = [...measurements].sort((a, b) => a - b)
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: Math.round((measurements.reduce((a, b) => a + b, 0) / measurements.length) * 100) / 100,
    count: measurements.length,
  }
}

function makeTranscriptEntry(size: "small" | "medium" | "large"): TranscriptEntry {
  const base = {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    kind: "assistant_text" as const,
    text: "",
  }
  switch (size) {
    case "small":
      base.text = "Hello, world! This is a short response."
      break
    case "medium":
      base.text = "x".repeat(4096) // ~4KB typical tool call result
      break
    case "large":
      base.text = "x".repeat(65536) // ~64KB large code block
      break
  }
  return base
}

interface BenchResult {
  name: string
  unit: string
  stats: ReturnType<typeof stats>
}

function resolveElapsed(handler: ((elapsed: number) => void) | null, elapsed: number) {
  if (typeof handler === "function") {
    handler(elapsed)
  }
}

function resolveBatch(handler: (() => void) | null) {
  if (typeof handler === "function") {
    handler()
  }
}

// ── Benchmarks ────────────────────────────────────────────────────

async function benchRawPubSub(nc: NatsConnection, iterations: number): Promise<BenchResult> {
  const subject = "bench.pubsub"
  const payload = encoder.encode(JSON.stringify(makeTranscriptEntry("small")))
  const latencies: number[] = []

  const sub = nc.subscribe(subject)
  const consumer = (async () => {
    for await (const _msg of sub) {
      // Just consume
    }
  })()

  // Warm up
  for (let i = 0; i < 50; i++) {
    nc.publish(subject, payload)
  }
  await nc.flush()
  await new Promise(r => setTimeout(r, 100))

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    nc.publish(subject, payload)
    await nc.flush()
    latencies.push(performance.now() - start)
  }

  sub.unsubscribe()
  await consumer.catch(() => {})

  return { name: "Raw pub/sub (small payload, flush per msg)", unit: "ms", stats: stats(latencies) }
}

async function benchRequestReply(nc: NatsConnection, iterations: number): Promise<BenchResult> {
  const subject = "bench.reqrep"
  const payload = encoder.encode(JSON.stringify({ type: "snapshot.subscribe", topic: { type: "sidebar" } }))
  const latencies: number[] = []

  const sub = nc.subscribe(subject)
  void (async () => {
    for await (const msg of sub) {
      msg.respond(encoder.encode(JSON.stringify({ ok: true, result: { projectGroups: [] } })))
    }
  })()

  // Warm up
  for (let i = 0; i < 20; i++) {
    await nc.request(subject, payload, { timeout: 5000 })
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await nc.request(subject, payload, { timeout: 5000 })
    latencies.push(performance.now() - start)
  }

  sub.unsubscribe()
  return { name: "Request/reply (command path)", unit: "ms", stats: stats(latencies) }
}

async function benchJetStreamPublish(js: JetStreamClient, iterations: number): Promise<BenchResult> {
  const payload = encoder.encode(JSON.stringify({
    type: "transcript",
    chatId: "bench-chat",
    entry: makeTranscriptEntry("small"),
  }))
  const latencies: number[] = []

  // Warm up
  for (let i = 0; i < 20; i++) {
    await js.publish("bench.js.events.chat1", payload)
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await js.publish("bench.js.events.chat1", payload)
    latencies.push(performance.now() - start)
  }

  return { name: "JetStream publish (await ack, small)", unit: "ms", stats: stats(latencies) }
}

async function benchJetStreamPublishFireForget(js: JetStreamClient, iterations: number): Promise<BenchResult> {
  const payload = encoder.encode(JSON.stringify({
    type: "transcript",
    chatId: "bench-chat",
    entry: makeTranscriptEntry("small"),
  }))
  const latencies: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    void js.publish("bench.js.events.chat1", payload)
    latencies.push(performance.now() - start)
  }

  return { name: "JetStream publish (fire-forget, small)", unit: "ms", stats: stats(latencies) }
}

async function benchJetStreamRoundTrip(nc: NatsConnection, js: JetStreamClient, iterations: number): Promise<BenchResult> {
  const latencies: number[] = []

  // Set up consumer
  const consumer = await js.consumers.get("BENCH_EVENTS", {
    filter_subjects: "bench.js.events.roundtrip",
    deliver_policy: DeliverPolicy.New,
  })
  const messages = await consumer.consume()

  let resolveNext: ((elapsed: number) => void) | null = null

  void (async () => {
    for await (const msg of messages) {
      const sent = JSON.parse(decoder.decode(msg.data)).sentAt as number
      resolveElapsed(resolveNext, performance.now() - sent)
    }
  })()

  // Warm up
  for (let i = 0; i < 20; i++) {
    await new Promise<number>((resolve) => {
      resolveNext = resolve
      void js.publish("bench.js.events.roundtrip", encoder.encode(JSON.stringify({
        sentAt: performance.now(),
      })))
    })
  }

  for (let i = 0; i < iterations; i++) {
    const elapsed = await new Promise<number>((resolve) => {
      resolveNext = resolve
      void js.publish("bench.js.events.roundtrip", encoder.encode(JSON.stringify({
        sentAt: performance.now(),
      })))
    })
    latencies.push(elapsed)
  }

  await messages.close()
  return { name: "JetStream round-trip (publish → consume)", unit: "ms", stats: stats(latencies) }
}

async function benchSerialization(iterations: number): Promise<BenchResult[]> {
  const results: BenchResult[] = []

  for (const size of ["small", "medium", "large"] as const) {
    const entry = makeTranscriptEntry(size)
    const event = { type: "transcript", chatId: "bench-chat", entry }
    const latencies: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      const json = JSON.stringify(event)
      encoder.encode(json)
      latencies.push(performance.now() - start)
    }

    const jsonSize = JSON.stringify(event).length
    results.push({
      name: `JSON.stringify + encode (${size}, ${jsonSize} bytes)`,
      unit: "ms",
      stats: stats(latencies),
    })
  }

  // Deserialization
  for (const size of ["small", "medium", "large"] as const) {
    const entry = makeTranscriptEntry(size)
    const event = { type: "transcript", chatId: "bench-chat", entry }
    const encoded = encoder.encode(JSON.stringify(event))
    const latencies: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      JSON.parse(decoder.decode(encoded))
      latencies.push(performance.now() - start)
    }

    results.push({
      name: `decode + JSON.parse (${size})`,
      unit: "ms",
      stats: stats(latencies),
    })
  }

  return results
}

async function benchCompression(iterations: number): Promise<BenchResult[]> {
  const results: BenchResult[] = []

  for (const size of ["small", "medium", "large"] as const) {
    const entry = makeTranscriptEntry(size)
    const raw = encoder.encode(JSON.stringify({ type: "transcript", chatId: "bench-chat", entry }))
    const latencies: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      compressPayload(raw)
      latencies.push(performance.now() - start)
    }

    const compressed = compressPayload(raw)
    const ratio = Math.round((compressed.length / raw.length) * 100)
    results.push({
      name: `compress (${size}, ${raw.length}→${compressed.length} bytes, ${ratio}%)`,
      unit: "ms",
      stats: stats(latencies),
    })
  }

  // Decompression
  for (const size of ["small", "medium", "large"] as const) {
    const entry = makeTranscriptEntry(size)
    const raw = encoder.encode(JSON.stringify({ type: "transcript", chatId: "bench-chat", entry }))
    const compressed = compressPayload(raw)
    const latencies: number[] = []

    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      await decompressPayload(compressed)
      latencies.push(performance.now() - start)
    }

    results.push({
      name: `decompress (${size})`,
      unit: "ms",
      stats: stats(latencies),
    })
  }

  return results
}

async function benchSnapshotDedup(iterations: number): Promise<BenchResult> {
  // Simulate the dedup path: JSON.stringify → string compare
  const data = {
    runtime: {
      chatId: "chat-1", projectId: "proj-1", localPath: "/home/user/project",
      title: "Test Chat", status: "running", provider: "claude", planMode: false,
      sessionToken: "session-abc",
    },
    messageCount: 150,
    availableProviders: ["claude", "codex"],
    availableSkills: ["commit", "review-pr", "test"],
  }
  const cache = new Map<string, string>()
  const latencies: number[] = []

  // First call — cache miss
  const json = JSON.stringify(data)
  cache.set("chat.chat-1", json)

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const newJson = JSON.stringify(data)
    const cached = cache.get("chat.chat-1")
    const changed = cached !== newJson
    if (changed) {
      cache.set("chat.chat-1", newJson)
    }
    latencies.push(performance.now() - start)
  }

  return { name: "Snapshot dedup (stringify + compare, unchanged)", unit: "ms", stats: stats(latencies) }
}

async function benchBroadcastSimulation(iterations: number): Promise<BenchResult> {
  // Simulate broadcastSnapshots with N subscriptions
  const subscriptionCount = 10 // sidebar + 3 chats + 2 terminals + sessions + orchestration + update + local-projects
  const data = Array.from({ length: subscriptionCount }, (_, i) => ({
    key: `topic-${i}`,
    snapshot: { id: i, data: "x".repeat(200) },
  }))
  const cache = new Map<string, string>()
  const latencies: number[] = []

  // Pre-populate cache (simulates steady state)
  for (const d of data) {
    cache.set(d.key, JSON.stringify(d.snapshot))
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const published = new Set<string>()
    for (const d of data) {
      if (published.has(d.key)) continue
      published.add(d.key)
      const json = JSON.stringify(d.snapshot)
      if (cache.get(d.key) !== json) {
        // Would publish — but in steady state, dedup catches it
      }
    }
    latencies.push(performance.now() - start)
  }

  return { name: `broadcastSnapshots sim (${subscriptionCount} subs, all deduped)`, unit: "ms", stats: stats(latencies) }
}

async function benchBroadcastStorm(nc: NatsConnection, js: JetStreamClient, iterations: number): Promise<BenchResult[]> {
  // Simulate the REAL application bottleneck:
  // N events arrive → each triggers broadcastSnapshots (10 subs × serialize × dedup)
  const results: BenchResult[] = []
  const eventCount = 50
  const subscriptionCount = 10

  // Build mock snapshot data for each subscription
  const snapshots = Array.from({ length: subscriptionCount }, (_, i) => ({
    key: `topic-${i}`,
    data: { id: i, status: "running", title: `Chat ${i}`, messageCount: 100 + i, extra: "x".repeat(200) },
  }))
  const dedupCache = new Map<string, string>()
  for (const s of snapshots) {
    dedupCache.set(s.key, JSON.stringify(s.data))
  }

  // Variant 1: Per-event broadcast (current behavior)
  {
    const latencies: number[] = []
    for (let i = 0; i < iterations; i++) {
      let broadcastCount = 0
      const start = performance.now()
      for (let e = 0; e < eventCount; e++) {
        // Simulate onStateChange() → broadcastSnapshots()
        const published = new Set<string>()
        for (const s of snapshots) {
          if (published.has(s.key)) continue
          published.add(s.key)
          const json = JSON.stringify(s.data)
          if (dedupCache.get(s.key) !== json) {
            // Would publish — but dedup catches unchanged snapshots
          }
        }
        broadcastCount++
      }
      latencies.push(performance.now() - start)
    }
    results.push({
      name: `broadcastStorm: per-event (${eventCount} events × ${subscriptionCount} subs)`,
      unit: "ms",
      stats: stats(latencies),
    })
  }

  // Variant 2: Debounced broadcast (coalesced into 1 call)
  {
    const latencies: number[] = []
    for (let i = 0; i < iterations; i++) {
      let broadcastCount = 0
      const start = performance.now()
      // All events arrive, but only ONE broadcast happens
      const published = new Set<string>()
      for (const s of snapshots) {
        if (published.has(s.key)) continue
        published.add(s.key)
        const json = JSON.stringify(s.data)
        if (dedupCache.get(s.key) !== json) {
          // Would publish
        }
      }
      broadcastCount++
      latencies.push(performance.now() - start)
    }
    results.push({
      name: `broadcastStorm: debounced (${eventCount} events → 1 broadcast)`,
      unit: "ms",
      stats: stats(latencies),
    })
  }

  return results
}

async function benchHighFrequencyPipeline(nc: NatsConnection, js: JetStreamClient, iterations: number): Promise<BenchResult> {
  // Simulate the streaming path: rapid events published → consumed → trigger broadcast
  const latencies: number[] = []
  const batchSize = 50 // Simulate 50 events in rapid succession (typical streaming burst)

  const consumer = await js.consumers.get("BENCH_EVENTS", {
    filter_subjects: "bench.js.events.burst",
    deliver_policy: DeliverPolicy.New,
  })
  const messages = await consumer.consume()

  let received = 0
  let batchResolve: (() => void) | null = null

  void (async () => {
    for await (const _msg of messages) {
      received++
      if (received % batchSize === 0) {
        resolveBatch(batchResolve)
      }
    }
  })()

  // Warm up
  for (let i = 0; i < batchSize; i++) {
    void js.publish("bench.js.events.burst", encoder.encode(JSON.stringify({
      type: "transcript", chatId: "bench", entry: makeTranscriptEntry("small"),
    })))
  }
  await new Promise<void>(r => { batchResolve = r })

  for (let i = 0; i < iterations; i++) {
    received = 0
    const start = performance.now()
    for (let j = 0; j < batchSize; j++) {
      void js.publish("bench.js.events.burst", encoder.encode(JSON.stringify({
        type: "transcript", chatId: "bench", entry: makeTranscriptEntry("small"),
      })))
    }
    await new Promise<void>(r => { batchResolve = r })
    latencies.push(performance.now() - start)
  }

  await messages.close()
  return { name: `Burst pipeline (${batchSize} events published+consumed)`, unit: "ms", stats: stats(latencies) }
}

// ── Main ──────────────────────────────────────────────────────────

async function run() {
  console.error("Starting NATS performance baseline...")

  // Start embedded NATS
  const server = await NatsServer.start({ host: "127.0.0.1", websocket: true, jetstream: true })
  const nc = await connect({ servers: server.url })
  const js = jetstream(nc)
  const jsm = await jetstreamManager(nc)

  // Create benchmark stream
  await jsm.streams.add({
    name: "BENCH_EVENTS",
    subjects: ["bench.js.events.>"],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
    max_age: 5 * 60 * 1_000_000_000,
    max_msgs: 100_000,
    max_bytes: 64 * 1024 * 1024,
  })

  const results: BenchResult[] = []
  const ITER = 500

  // 1. Transport benchmarks
  console.error("  [1/8] Raw pub/sub...")
  results.push(await benchRawPubSub(nc, ITER))

  console.error("  [2/8] Request/reply...")
  results.push(await benchRequestReply(nc, ITER))

  console.error("  [3/8] JetStream publish (awaited)...")
  results.push(await benchJetStreamPublish(js, ITER))

  console.error("  [4/8] JetStream publish (fire-forget)...")
  results.push(await benchJetStreamPublishFireForget(js, ITER))

  console.error("  [5/8] JetStream round-trip...")
  results.push(await benchJetStreamRoundTrip(nc, js, ITER))

  // 2. Serialization benchmarks
  console.error("  [6/8] Serialization...")
  results.push(...await benchSerialization(ITER * 2))

  // 3. Compression benchmarks
  console.error("  [7/8] Compression...")
  results.push(...await benchCompression(ITER))

  // 4. Application-level benchmarks
  console.error("  [8/9] Application patterns...")
  results.push(await benchSnapshotDedup(ITER * 2))
  results.push(await benchBroadcastSimulation(ITER * 2))

  console.error("  [9/9] Broadcast storm + burst pipeline...")
  results.push(...await benchBroadcastStorm(nc, js, ITER))
  results.push(await benchHighFrequencyPipeline(nc, js, 20))

  // Cleanup
  await nc.drain()
  await server.stop()

  // Output
  if (JSON_FLAG) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      iterations: ITER,
      results: results.map(r => ({
        name: r.name,
        unit: r.unit,
        ...r.stats,
      })),
    }, null, 2))
  } else {
    console.log("\n=== NATS Communication Performance Baseline ===\n")
    for (const r of results) {
      console.log(`${r.name}`)
      console.log(`  p50: ${r.stats.p50.toFixed(3)}ms  p95: ${r.stats.p95.toFixed(3)}ms  p99: ${r.stats.p99.toFixed(3)}ms  mean: ${r.stats.mean.toFixed(3)}ms`)
    }
    console.log("")
  }
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
