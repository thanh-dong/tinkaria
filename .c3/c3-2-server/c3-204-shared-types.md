---
id: c3-204
c3-seal: 7859add1a9edaaec10ce26f5509998827bb3c6c47d9879797d2e0e7342182c3d
title: shared-types
type: component
category: foundation
parent: c3-2
goal: Shared type definitions, WebSocket protocol envelope schema, tool normalization, port constants, and branding used by both client and server.
uses:
    - ref-component-identity-mapping
    - ref-mcp-app-hosting
    - ref-zod-defensive-validation
    - rule-bun-test-conventions
    - rule-graceful-fallbacks
    - rule-rule-strict-typescript
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
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-type-guards |  |
| rule-graceful-fallbacks |  |
## Container Connection

Part of c3-2 (server). The shared contract layer — defines the types and protocol that the client (c3-1) and server (c3-2) agree on.
