---
id: c3-110
c3-seal: 70afafc63bc85c2b677f1378e5bcc60231adc27434c94365c39a4d089dec868e
title: chat
type: component
category: feature
parent: c3-1
goal: 'Render the `/chat/:chatId` workspace: transcript, navbar, composer, fork-session dialog, and optional right sidebar, with live chat state managed through TinkariaState and semantic ids exposed for Alt+Shift inspection.'
uses:
    - c3-108
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-fork-session-seeding
    - ref-mcp-app-jtbd
    - ref-nats-transport-hardening
    - ref-project-c3-app-surface
    - ref-ref-jetstream-streaming
    - ref-ref-websocket-protocol
    - ref-ref-zustand-stores
    - ref-responsive-modal-pattern
    - ref-screen-composition-patterns
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

## Goal

Render the `/chat/:chatId` workspace: transcript, navbar, composer, fork-session dialog, and optional right sidebar, with live chat state managed through TinkariaState and semantic ids exposed for Alt+Shift inspection.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | NATS snapshot updates from server | c3-205 |
| OUT | Chat/message commands via NATS request/reply | c3-205 |
| IN | Terminal events from NATS subjects | c3-205 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-websocket-protocol | Real-time bidirectional communication for chat and state sync |
| ref-ref-zustand-stores | Client-side UI state for layout and preferences |
| c3-108 |  |
| ref-ref-jetstream-streaming |  |
| ref-fork-session-seeding |  |
| ref-component-identity-mapping |  |
| ref-responsive-modal-pattern |  |
| ref-project-c3-app-surface |  |
| recipe-project-c3-jtbd-flow |  |
| ref-mcp-app-jtbd |  |
| ref-nats-transport-hardening |  |
| ref-screen-composition-patterns |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-prefixed-logging |  |
| rule-react-no-effects |  |
| rule-graceful-fallbacks |  |
| rule-error-extraction |  |
| rule-ui-identity-composition |  |
| rule-ui-component-usage |  |
## Container Connection

Part of c3-1 (client). The primary feature — renders at /chat/:chatId route. Composes chat-input, messages, terminal, and right-sidebar into a unified workspace.
