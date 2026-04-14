---
id: c3-226
c3-seal: 3751a1ec3f1de3430e730298febc721bbd1c8a958d2c423b289fad1a4038a6a0
title: transcript-runtime
type: component
category: feature
parent: c3-2
goal: 'Own server-side transcript event consumption: runner turn events, JetStream/KV resume, store append/update calls, active status tracking, and state-change notifications that feed client subscriptions.'
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

Own server-side transcript event consumption: runner turn events, JetStream/KV resume, store append/update calls, active status tracking, and state-change notifications that feed client subscriptions.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Runner turn events from kit/runtime bridge | c3-208 |
| IN | Shared runner/transcript event protocol | c3-204 |
| OUT | Persisted transcript entries and turn lifecycle updates | c3-201 |
| OUT | Live agent flow consumed by client transcript lifecycle | c3-118 |
## Container Connection

Part of c3-2 (server). This component separates durable transcript/event handoff from provider execution and search so agent-flow render issues can be reasoned about from runner event through UI hydration.
