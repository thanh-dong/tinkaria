---
id: c3-113
c3-seal: 171412093d870e8e93fb47acebb353680dae0b6688c14050ad7f83f90550e9f4
title: sidebar
type: component
category: feature
parent: c3-1
goal: 'Render the persistent left sidebar: project-group navigation, chat rows, per-project menus, and resumable session picker overlays, with shared sidebar ui ids for Alt+Shift inspection.'
uses:
    - c3-108
    - ref-component-identity-mapping
    - ref-mobile-tabbed-page-pattern
    - ref-ref-radix-primitives
    - ref-ref-websocket-protocol
    - ref-responsive-modal-pattern
    - ref-screen-composition-patterns
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

## Goal

Render the persistent left sidebar: project-group navigation, chat rows, per-project menus, and resumable session picker overlays, with shared sidebar ui ids for Alt+Shift inspection.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Sidebar snapshot data and chat/project actions from TinkariaState | c3-110 |
| IN | Session discovery snapshots per project | c3-217 |
| IN | Shared semantic ui-id helpers for rows, groups, and session picker surfaces | c3-108 |
| OUT | Route navigation to / and /chat/:chatId plus resume-session intents | c3-101 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-websocket-protocol | Real-time sidebar data updates via WebSocket subscriptions |
| ref-ref-radix-primitives | Context menus and button primitives for project, chat, and collapsed-shell actions |
| c3-108 |  |
| ref-component-identity-mapping |  |
| ref-responsive-modal-pattern |  |
| ref-screen-composition-patterns |  |
| ref-mobile-tabbed-page-pattern |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-react-no-effects |  |
| rule-ui-identity-composition |  |
| rule-ui-component-usage |  |
## Container Connection

Part of c3-1 (client). This shell stays mounted across routed screens and gives Alt+Shift a stable sidebar ownership map: chat rows, project groups, menus, and session picker overlays all resolve back here.
