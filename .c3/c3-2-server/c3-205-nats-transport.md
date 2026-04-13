---
id: c3-205
c3-seal: a46b723e9546851418294ea6d7f6c8c7bf91052cc3b23179c87ece603f5a2dec
title: nats-transport
type: component
category: foundation
parent: c3-2
goal: Embedded NATS transport layer — starts nats-server subprocess (TCP + WebSocket + JetStream), manages auth tokens, publishes snapshots to KV-backed subjects with dedup, handles command request/reply, and streams terminal events via JetStream.
uses:
    - ref-component-identity-mapping
    - ref-external-source-authority-boundaries
    - ref-fork-session-seeding
    - ref-nats-transport-hardening
    - ref-ref-jetstream-streaming
    - ref-ref-websocket-protocol
    - ref-runtime-operational-readiness
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-external-source-stale-handle-guards
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-subprocess-ipc-safety
---

## Goal

Embedded NATS transport layer — starts nats-server subprocess (TCP + WebSocket + JetStream), manages auth tokens, publishes snapshots to KV-backed subjects with dedup, handles command request/reply, and streams terminal events via JetStream.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Store state and domain events | c3-201 |
| IN | Agent status updates | c3-210 |
| IN | Read model projections | c3-214 |
| OUT | Snapshot subjects for clients | c3-110 |
| OUT | Command replies for clients | c3-110 |
| IN | Session discovery snapshots and resume/import helpers | c3-217 |
## Container Connection

Part of c3-2 (server). Replaces the previous WebSocket router (c3-202) as the sole real-time transport — all client-server communication flows through NATS subjects.
