---
id: c3-204
c3-seal: 5032e8c5f46dec3f7b3d605319bf5ef4525050cfb3dbb92bf6826b0ca065e12c
title: shared-types
type: component
category: foundation
parent: c3-2
goal: Shared type definitions, WebSocket/NATS command protocol envelope schema, tool normalization, port constants, and branding used by both client and server.
uses:
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-mcp-app-hosting
    - ref-zod-defensive-validation
    - rule-bun-test-conventions
    - rule-graceful-fallbacks
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
    - rule-type-guards
---

## Goal

Shared type definitions, WebSocket/NATS command protocol envelope schema, tool normalization, port constants, and branding used by both client and server.

Protocol responsibilities:

- Define typed client commands such as `chat.send`, `chat.queue`, `chat.cancel`, `chat.respondTool`, snapshots, and workspace/runtime commands.
- Keep command payloads provider-neutral where possible while preserving provider/model/modelOptions fields at the boundary.
- Keep shared protocol types pure TypeScript with no server/client runtime dependency.
`chat.queue` is the durable follow-up command. The client uses it only for an existing chat; the server either sends immediately when idle or persists a queued turn for later drain when a turn is active or just-started.

## Dependencies

- None (leaf module — depended on by nearly everything else)
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-websocket-protocol | Protocol envelope types and subscription topics |
| ref-zod-defensive-validation |  |
| ref-component-identity-mapping |  |
| ref-mcp-app-hosting |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-type-guards |  |
| rule-graceful-fallbacks |  |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-2 (server). The shared contract layer — defines the types and protocol that the client (c3-1) and server (c3-2) agree on.
