---
id: c3-208
c3-seal: 7013882b1163b48159cd4c3ca621c3b30bcde8843bc197c4956fe21a6adb1c17
title: kit-runtime
type: component
category: foundation
parent: c3-2
goal: 'Own the hub-to-kit execution seam for Codex turns: track stable project-to-kit assignment, bridge turn/session traffic over NATS, and run the default local long-running kit without changing the client command surface.'
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-nats-transport-hardening
    - ref-ref-jetstream-streaming
    - ref-runtime-operational-readiness
    - rule-provider-runtime-readiness
    - rule-subprocess-ipc-safety
    - rule-transcript-boundary-regressions
---

## Goal

Own the hub-to-kit execution seam for Codex turns: track stable project-to-kit assignment, bridge turn/session traffic over NATS, and run the default local long-running kit without changing the client command surface.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Embedded NATS transport subjects and request/reply channel for kit registration, turn control, and event streaming | c3-205 |
| IN | Codex app-server session and turn execution running inside the kit daemon | c3-216 |
| OUT | Project-aware Codex runtime used by AgentCoordinator instead of direct in-process execution | c3-210 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-provider-abstraction | Keeps the new kit path provider-scoped and preserves the shared agent runtime contract. |
| ref-ref-jetstream-streaming |  |
| ref-component-identity-mapping |  |
| ref-runtime-operational-readiness |  |
| ref-nats-transport-hardening |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Focused regression coverage for project assignment and remote turn/tool bridging. |
| rule-error-extraction | NATS and kit runtime failures are surfaced safely. |
| rule-prefixed-logging | Kit shutdown failures keep greppable server logs. |
| rule-rule-bun-runtime | Kit daemon and runtime client stay on Bun-native server APIs. |
| rule-rule-strict-typescript | Kit protocol payloads and runtime bindings stay strongly typed. |
| rule-subprocess-ipc-safety |  |
| rule-provider-runtime-readiness |  |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-2 (server). This is the new execution boundary between the hub-owned agent/orchestration state and the Codex process that now runs behind a long-running local kit over embedded NATS.
