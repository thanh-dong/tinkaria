---
id: c3-226
c3-seal: 4ea5831a477621fe6412ddc93e4ec0d77e3089eba001a6f5d06a0b7318d67f2e
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

# transcript-runtime
## Goal

Own server-side transcript event consumption: runner turn events, JetStream/KV resume, store append/update calls, active status tracking, queue-drain triggers, and state-change notifications that feed client subscriptions.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent | c3-2 |
| Role | Own transcript-runtime behavior inside the parent container without taking over sibling responsibilities. |
| Boundary | Keep transcript-runtime decisions inside this component and escalate container-wide policy to the parent. |
| Collaboration | Coordinate with cited governance and adjacent components before changing the contract. |
## Purpose

Provide durable agent-ready documentation for transcript-runtime so generated code, tests, and follow-up docs preserve ownership, boundaries, governance, and verification evidence.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Parent container context is loaded before transcript-runtime behavior is changed. | ref-live-transcript-render-contract |
| Inputs | Accept only the files, commands, data, or calls that belong to transcript-runtime ownership. | ref-live-transcript-render-contract |
| State / data | Preserve explicit state boundaries and avoid hidden cross-component ownership. | ref-live-transcript-render-contract |
| Shared dependencies | Use lower-layer helpers and cited references instead of duplicating shared policy. | ref-live-transcript-render-contract |
## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Actor / caller | Agent, command, or workflow asks transcript-runtime to deliver its documented responsibility. | ref-live-transcript-render-contract |
| Primary path | Follow the component goal, honor parent fit, and emit behavior through the documented contract. | ref-live-transcript-render-contract |
| Alternate paths | When a request falls outside transcript-runtime ownership, hand it to the parent or sibling component. | ref-live-transcript-render-contract |
| Failure behavior | Surface mismatch through check, tests, lookup, or review evidence before derived work ships. | ref-live-transcript-render-contract |
## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-live-transcript-render-contract | ref | Governs transcript-runtime behavior, derivation, or review when applicable. | Explicit cited governance beats uncited local prose. | Migrated from legacy component form; refine during next component touch. |
## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| runner event input | IN | TranscriptConsumer consumes runner events from JetStream and stores transcript/status/session/title/provider/plan changes. | c3-208 kit-runtime boundary | src/server/transcript-consumer.ts; src/server/transcript-consumer.test.ts |
| observed active statuses | OUT | activeStatuses is a transcript-observed status map, not the only source of active-turn truth; RunnerProxy also owns recentlyStartedChats for pre-status races. | c3-210 agent boundary | src/server/transcript-consumer.ts; src/server/runner-proxy.ts |
| queue drain trigger | OUT | onStateChange drains queued turns only when a previously active chat disappears from TranscriptConsumer activeStatuses. | c3-210 agent boundary | src/server/server.ts; src/server/runner-proxy.ts; src/server/runner-proxy.test.ts |
| client notification | OUT | State changes broadcast chat sidebar/client snapshots and push notifications without owning provider-specific turn startup. | c3-1 client boundary | src/server/server.ts; src/server/transcript-consumer.ts |
## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Active-state overclaim | A change treats TranscriptConsumer activeStatuses as the sole active-turn source. | Immediate post-start sendInput races miss active state until status_change is consumed. | Read c3-210 Contract; bun test src/server/runner-proxy.test.ts --test-name-pattern 'activeTurns.has() returns true immediately' |
| Queue drain missed | onStateChange does not call drainQueuedTurn when an active chat disappears. | Queued turns remain in EventStore after turn_finished/turn_failed/turn_cancelled. | src/server/server.ts; bun test src/server/runner-proxy.test.ts --test-name-pattern 'drainQueuedTurn' |
| JetStream setup hides behavior regressions | TranscriptConsumer tests fail at embedded NATS stream setup before assertions. | Error says JetStreamApiError: insufficient storage resources available. | src/server/transcript-consumer.test.ts; rerun isolated before changing transcript-runtime behavior. |
| Contract drift | Goal, boundary, or derived material changes without matching component docs. | Compare Goal, Parent Fit, Contract, and Derived Materials. | C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check |
## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Code, docs, tests, prompts | Goal, Governance, Contract, and Change Safety sections. | Names and framework shape may vary; behavior and boundaries may not. | c3x check, c3x verify, and relevant tests. |
