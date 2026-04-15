---
id: c3-210
c3-seal: a6453fe552b09f4d063ba07ce6ff2060ff7f789646311314c515f616941f3016
title: agent
type: component
category: feature
parent: c3-2
goal: RunnerProxy and provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, transcript event flow, queued follow-up ownership, and provider handoff without leaking provider transport details across the server.
uses:
    - c3-206
    - c3-207
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-external-source-authority-boundaries
    - ref-live-transcript-render-contract
    - ref-ref-provider-abstraction
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-external-source-stale-handle-guards
    - rule-prefixed-logging
    - rule-provider-harness-boundaries
    - rule-provider-runtime-readiness
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

RunnerProxy and provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, transcript event flow, queued follow-up ownership, and provider handoff without leaking provider transport details across the server.

`RunnerProxy` is the command-facing runtime coordinator:

- `send(chat.send)` starts an immediate runner turn, creating a chat if needed and persisting provider/model/plan-mode selection.
- `queue(chat.queue)` is the server-owned follow-up path for existing chats. If the chat is idle it sends immediately; if the chat is active or just-started it persists/coalesces the queued turn in c3-201.
- `drainQueuedTurn(chatId)` claims the persisted queued turn, clears it before execution, and starts a new turn. If start fails, it re-enqueues the queued turn so retry/replay remains possible.
- Recently-started chat ids cover the race between `chat.send` returning and the transcript runtime publishing a busy status, so fast follow-ups do not bypass the queue.
Provider harness details stay behind dedicated runtime boundaries; client code only sees command results and transcript snapshots.
## Dependencies

| From/To | Direction | What |
| --- | --- | --- |
| c3-201 | IN | Transcript persistence, queued turn records, and turn lifecycle state |
| c3-211 | IN | Provider model normalization and capability lookup |
| c3-206 | IN | Cross-session delegation tooling and wait/cancel semantics |
| c3-207 | IN | Shared web-context prompt composition and developer-instructions guidance |
| c3-216 | IN | Codex provider backend returning HarnessTurn streams |
| c3-208 | OUT | Runner start/cancel/respond commands over the kit/runtime bridge |
| c3-201 | OUT | Transcript entries, session tokens, account info, and queued turn mutations persisted to the store |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-provider-abstraction | Provider harness seams keep Claude and Codex behind the same coordinator contract. |
| ref-component-identity-mapping |  |
| ref-external-source-authority-boundaries |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively. |
| rule-rule-strict-typescript | Strict typing enforced across turn state and harness payloads. |
| rule-error-extraction | Runtime failures are surfaced safely. |
| rule-bun-test-conventions | Focused regression tests cover provider turn behavior and harness seams. |
| rule-prefixed-logging | Turn activity uses greppable log prefixes. |
| rule-external-source-stale-handle-guards |  |
| rule-provider-harness-boundaries | Provider transport/bootstrap stays behind dedicated harness entrypoints. |
| rule-provider-runtime-readiness |  |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-2 (server). This is the main AI execution control plane: it bridges client chat commands to runner-backed provider runtimes, delegates prompt composition to c3-207, keeps orchestration in c3-206, consumes transcript event flow from the runtime bridge, and reaches provider-specific bootstrap through dedicated harness seams instead of inlining transport logic.
