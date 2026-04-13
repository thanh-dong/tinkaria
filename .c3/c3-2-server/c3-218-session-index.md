---
id: c3-218
c3-seal: 3eb52039539bfdf17b8be64fe3a315921326278d9874700cd311420769775fc2
title: session-index
type: component
category: feature
parent: c3-2
goal: SessionIndex read model — derives per-session summaries (intent, files touched, commands run, branch, status) from EventStore transcript entries. Updated on every message append.
uses:
    - ref-component-identity-mapping
    - ref-ref-event-sourcing
    - rule-bun-test-conventions
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

SessionIndex read model — derives per-session summaries (intent, files touched, commands run, branch, status) from EventStore transcript entries. Updated on every message append.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | TranscriptEntry events and StoreState for chat/project lookup | c3-201 |
| IN | SessionRecord, SessionStatus types | c3-204 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-event-sourcing | Read-side projection from the event-sourced store, same pattern as SidebarData |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced |
| rule-bun-test-conventions | Bun test framework with describe/test grouping |
## Code References

| File | Purpose |
| --- | --- |
| src/server/session-index.ts | SessionIndex class — derives per-session summaries from transcript events |
| src/server/session-index.test.ts | Tests for SessionIndex |
## Container Connection

Part of c3-2 (server). Provides cross-session awareness by projecting session summaries from the EventStore message pipeline, consumed by the ProjectAgent (c3-222).
