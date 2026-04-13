---
id: c3-224
c3-seal: 2788ec77594c7daa2a84cff500e909bb5232269b071b338aa2517c61f9ab189b
title: journey-verification
type: component
category: feature
parent: c3-2
goal: Own agent-browser based screen-inventory journey verification and evidence capture for local end-to-end flows.
uses:
    - ref-component-identity-mapping
    - ref-workspace-journey-test-contracts
    - rule-bun-test-conventions
    - rule-journey-test-coverage
    - rule-rule-strict-typescript
---

## Goal

Own agent-browser based screen-inventory journey verification and evidence capture for local end-to-end flows.

## Dependencies

- scripts/verify-journey.ts (boots isolated local runtime, drives agent-browser, captures evidence)
- src/server/journey-verification.ts (journey inventory, stage contracts, route and UI-id assertions)
- src/server/journey-verification.test.ts (contract-level regression coverage for the journey specs)
- c3-117 (projects) - homepage inventory and project launch surface under test
- c3-110 (chat) - chat page route reached by the first practical journey
- c3-111 (messages) - transcript region required by the chat-ready stage
- c3-112 (chat-input) - composer region required by the chat-ready stage
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping | Journey assertions rely on stable semantic data-ui-id ownership. |
| ref-workspace-journey-test-contracts |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Keep verification helpers deterministic and focused. |
| rule-rule-strict-typescript | The typed stage contracts and runner must stay strict. |
| rule-journey-test-coverage |  |
## Container Connection

Part of c3-2 (server). This component provides local black-box verification tooling that proves route-level screen composition and journey transitions against a live runtime instead of only unit-scoped behavior.
