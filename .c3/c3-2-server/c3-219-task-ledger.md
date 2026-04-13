---
id: c3-219
c3-seal: 79753cb0f8db70be33789a286ffa6ab88ddcca452e0a6b8c1a37e60556c97b11
title: task-ledger
type: component
category: feature
parent: c3-2
goal: TaskLedger — coordination state tracking task ownership across sessions. Supports claim, complete, abandon lifecycle with automatic abandoned detection via configurable timeout.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

TaskLedger — coordination state tracking task ownership across sessions. Supports claim, complete, abandon lifecycle with automatic abandoned detection via configurable timeout.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | TaskEntry, TaskStatus types | c3-204 |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced |
| rule-bun-test-conventions | Bun test framework with describe/test grouping |
## Code References

| File | Purpose |
| --- | --- |
| src/server/task-ledger.ts | TaskLedger class — task ownership claim/complete/abandon lifecycle |
| src/server/task-ledger.test.ts | Tests for TaskLedger |
## Container Connection

Part of c3-2 (server). Provides the "who owns what" coordination primitive consumed by ProjectAgent (c3-222) to prevent duplicate work across sessions.
