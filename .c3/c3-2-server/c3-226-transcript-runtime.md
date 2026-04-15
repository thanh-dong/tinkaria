---
id: c3-226
c3-seal: 3e3f07f5aff990bed2a6bc75330f7cb1e39a0b5ae98c8a354dc8221de5dad1dd
title: transcript-runtime
type: component
category: feature
parent: c3-2
goal: 'Own server-side transcript event consumption: runner turn events, JetStream/KV resume, store append/update calls, active status tracking, queue-drain triggers, and state-change notifications that feed client subscriptions.'
uses:
    - c3-201
    - c3-204
    - c3-208
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Own server-side transcript event consumption: runner turn events, JetStream/KV resume, store append/update calls, active status tracking, queue-drain triggers, and state-change notifications that feed client subscriptions.

Turn-settle contract:

- `turn_finished`, `turn_failed`, and `turn_cancelled` persist the outcome to c3-201 and remove the chat from active statuses.
- Server status-change handling compares previous active statuses to current active statuses.
- When a chat leaves active status, the server calls `RunnerProxy.drainQueuedTurn(chatId)` so persisted queued follow-ups continue behind the screen without relying on a mounted frontend route.
- Waiting-for-user transitions still trigger input-needed notifications and do not drain queued turns until the active turn actually settles.
## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Runner turn events from kit/runtime bridge | c3-208 |
| IN | Shared runner/transcript event protocol | c3-204 |
| OUT | Persisted transcript entries, turn lifecycle updates, and active status removal | c3-201 |
| OUT | Queue-drain signal after active turn settles | c3-210 |
| OUT | Live agent flow consumed by client transcript lifecycle | c3-118 |
## Container Connection

Part of c3-2 (server). This component separates durable transcript/event handoff from provider execution and search so agent-flow render issues can be reasoned about from runner event through UI hydration.
