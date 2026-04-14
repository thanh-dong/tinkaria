---
id: c3-118
c3-seal: 0cda8141b10305ae6bf155551b2f54c9b5ad6fe3056637da9a715421bfa814af
title: transcript-lifecycle
type: component
category: feature
parent: c3-1
goal: 'Own live transcript ingestion on the client: cache restore, snapshot/tail fetch, backfill, event buffering, incremental hydration, RAF batching, and message-array handoff to the transcript renderer.'
uses:
    - c3-106
    - c3-204
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Own live transcript ingestion on the client: cache restore, snapshot/tail fetch, backfill, event buffering, incremental hydration, RAF batching, and message-array handoff to the transcript renderer.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Chat snapshots and transcript events from WebSocket/NATS client state | c3-110 |
| IN | Shared transcript entry and tool result shapes | c3-204 |
| OUT | Hydrated transcript messages and message-count/cache state | c3-119 |
| OUT | Structured artifact tool results for present_content render path | c3-106 |
## Container Connection

Part of c3-1 (client). This component explains why live transcript state is not just route state: it bridges server event order into stable hydrated UI messages before rendering decisions happen.
