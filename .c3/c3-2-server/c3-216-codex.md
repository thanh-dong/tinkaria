---
id: c3-216
c3-seal: d88c797d64944389ac965bc1c667d5a9f251ae19e9cb5be03f360c04bba9b90e
title: codex
type: component
category: feature
parent: c3-2
goal: Codex CLI protocol wrapper that spawns the Codex app-server subprocess, communicates via JSON-RPC over stdin/stdout, advertises dynamic tools, and translates Codex events into the shared harness turn model consumed by the higher-level provider seam in c3-210.
uses:
    - c3-106
    - c3-207
    - recipe-agent-turn-render-flow
    - recipe-project-c3-app-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-mcp-app-hosting
    - ref-mcp-app-jtbd
    - ref-ref-provider-abstraction
    - ref-zod-defensive-validation
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-provider-harness-boundaries
    - rule-provider-runtime-readiness
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-subprocess-ipc-safety
    - rule-transcript-boundary-regressions
---

## Goal

Codex CLI protocol wrapper that spawns the Codex app-server subprocess, communicates via JSON-RPC over stdin/stdout, advertises dynamic tools, and translates Codex events into the shared harness turn model consumed by the higher-level provider seam in c3-210.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Shared prompt/developer-instructions composition for Codex turns | c3-207 |
| IN | Shared transcript and tool payload types | c3-204 |
| IN | Zod schema validation for dynamic tool payload safety | ref-zod-defensive-validation |
| OUT | Codex HarnessTurn streams consumed by AgentCoordinator and its provider harness seam | c3-210 |
| OUT | Dynamic tool payloads for dedicated present_content transcript artifacts | c3-106 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-provider-abstraction | Codex provider transport stays behind the shared harness contract. |
| ref-zod-defensive-validation | Dynamic tool payloads are validated before entering the transcript. |
| ref-component-identity-mapping |  |
| ref-mcp-app-hosting |  |
| recipe-project-c3-app-flow |  |
| ref-mcp-app-jtbd |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server bridge code stays on Bun-native APIs. |
| rule-rule-strict-typescript | Protocol and transcript payloads remain strongly typed. |
| rule-error-extraction | App-server and transport failures are surfaced safely. |
| rule-bun-test-conventions | Protocol-level regression tests cover turn/start and dynamic tool behavior. |
| rule-prefixed-logging | Runtime bridge activity stays greppable. |
| rule-subprocess-ipc-safety |  |
| rule-provider-harness-boundaries | Codex transport stays below the higher-level harness seam instead of leaking into the coordinator. |
| rule-provider-runtime-readiness |  |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-2 (server). This is the low-level Codex provider runtime adapter below the runner/provider seam: prompt context comes from c3-207, structured artifact output feeds c3-106, transcript events participate in the live render contract, and higher-level turn/session orchestration remains in c3-210/c3-208.
