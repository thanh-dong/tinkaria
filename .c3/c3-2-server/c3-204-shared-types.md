---
id: c3-204
c3-seal: 258fd2197a3caaf3d87dc421d62b249cd21ad5be4c22ff535c7ff32d60be1706
title: shared-types
type: component
category: foundation
parent: c3-2
goal: Shared type definitions, WebSocket protocol envelope schema, tool normalization, port constants, and branding used by both client and server.
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

Shared type definitions, WebSocket protocol envelope schema, tool normalization, port constants, and branding used by both client and server.

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
