---
id: c3-214
c3-seal: 11362ad8e44ee158c76a21ba3d9f3ec4b4bd6204d300488ec8d106c94b84da6c
title: read-models
type: component
category: feature
parent: c3-2
goal: CQRS read-side projections — derives sidebar data, chat snapshots, and local projects snapshots from the event store state for WebSocket delivery.
uses:
    - recipe-project-c3-app-flow
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-mcp-app-jtbd
    - ref-project-c3-app-surface
    - ref-ref-event-sourcing
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

CQRS read-side projections — derives sidebar data, chat snapshots, and local projects snapshots from the event store state for WebSocket delivery.

## Dependencies

- c3-201 (event-store) — StoreState (projectsById, chatsById maps)
- c3-211 (providers) — SERVER_PROVIDERS for availableProviders in chat snapshots
- c3-204 (shared-types) — ChatSnapshot, SidebarData, LocalProjectsSnapshot, KannaStatus, ChatRuntime
- src/server/events.ts (ChatRecord, StoreState)
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-event-sourcing | Read-side projections derived from the event-sourced store state |
| ref-component-identity-mapping |  |
| ref-project-c3-app-surface |  |
| recipe-project-c3-app-flow |  |
| ref-mcp-app-jtbd |  |
| recipe-project-c3-jtbd-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-error-extraction |  |
| rule-bun-test-conventions |  |
| rule-prefixed-logging |  |
## Container Connection

Part of c3-2 (server). The read-model layer between the event store (c3-201) and the ws-router (c3-202) — transforms raw state into client-ready view snapshots.
