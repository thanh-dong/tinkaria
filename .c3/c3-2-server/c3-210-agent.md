---
id: c3-210
c3-seal: 6882d80faf5bab941378823baf69b2107b3af472caeb18a0e38737d3f0013826
title: agent
type: component
category: feature
parent: c3-2
goal: RunnerProxy and provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, transcript event flow, and provider handoff without leaking provider transport details across the server.
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

RunnerProxy and provider harness seams manage multi-turn AI agent sessions, prompt shaping, tool gating, plan mode, transcript event flow, and provider handoff without leaking provider transport details across the server.

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
