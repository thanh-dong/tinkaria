# Autoresearch: NATS Communication Performance

## Scope
Optimize Runner → NATS → Server → Client streaming pipeline.

## Target Metric
- **Primary**: Burst pipeline throughput (50 events published+consumed) — lower is better
- **Secondary**: JetStream round-trip latency — lower is better

## Direction
lower_is_better

## Benchmark
`bun scripts/perf-nats-baseline.ts --json`

## Key Metrics (from JSON output)
- `burst_p50_ms`: Burst pipeline p50 latency
- `burst_p95_ms`: Burst pipeline p95 latency
- `js_roundtrip_p50_ms`: JetStream round-trip p50
- `js_publish_await_p50_ms`: JetStream publish (awaited) p50

## Scoped Files
- `src/runner/runner-agent.ts` — RunnerAgent.publishEvent hot path
- `src/server/transcript-consumer.ts` — TranscriptConsumer.handleEvent → onStateChange
- `src/server/nats-publisher.ts` — broadcastSnapshots, publishSnapshot
- `src/server/server.ts` — broadcast wiring (debounce)
- `src/shared/compression.ts` — compressPayload/decompressPayload

## Bottleneck Priority
1. broadcastSnapshots() storms (every event → full recompute all subs)
2. Awaited JetStream publish in runner (10x slower than fire-forget)
3. No batching of transcript events
4. Snapshot dedup always serializes before comparing
5. Client DecompressionStream overhead

## Baseline
Run 1 (pre-optimization):
- Burst 50 events: p50=1.5ms, p95=5.1ms
- JetStream round-trip: p50=0.067ms, p95=0.121ms
- JetStream publish (awaited): p50=0.084ms
