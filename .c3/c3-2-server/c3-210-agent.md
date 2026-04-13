---
id: c3-210
c3-seal: 12560d4ece60f645e81a4bc17e095fdb9fb0fc3a871ffc69bb89489c6a72e42f
title: agent
type: component
category: feature
parent: c3-2
goal: AgentCoordinator and its provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, and provider handoff without leaking provider transport details across the server.
uses:
    - c3-206
    - c3-207
    - ref-component-identity-mapping
    - ref-external-source-authority-boundaries
    - ref-ref-provider-abstraction
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-external-source-stale-handle-guards
    - rule-prefixed-logging
    - rule-provider-harness-boundaries
    - rule-provider-runtime-readiness
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

AgentCoordinator and its provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, and provider handoff without leaking provider transport details across the server.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Transcript persistence and turn lifecycle state | c3-201 |
| IN | Provider model normalization and capability lookup | c3-211 |
| IN | Cross-session delegation tooling and wait/cancel semantics | c3-206 |
| IN | Shared web-context prompt composition and developer-instructions guidance | c3-207 |
| IN | Codex provider backend returning HarnessTurn streams | c3-216 |
| OUT | Transcript entries, session tokens, and account info persisted to the store | c3-201 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-provider-abstraction | Provider harness seams keep Claude and Codex behind the same coordinator contract. |
| ref-component-identity-mapping |  |
| ref-external-source-authority-boundaries |  |
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
## Container Connection

Part of c3-2 (server). This is the main AI execution engine: it bridges client chat commands to provider runtimes, delegates prompt composition to c3-207, keeps orchestration in c3-206, and reaches provider-specific bootstrap through dedicated harness seams instead of inlining transport logic.
