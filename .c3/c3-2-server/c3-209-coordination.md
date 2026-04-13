---
id: c3-209
c3-seal: 5f11f3a3b843aba37b11a19f77e89f1695d382ad7a9c362fb3f208e7144d63d0
title: coordination
type: component
category: foundation
parent: c3-2
goal: Cross-session project coordination — durable shared todos, file claims, worktrees, and rules. EventStore-backed JSONL persistence with NATS JetStream distribution and MCP tool interface.
uses:
    - ref-ref-event-sourcing
    - ref-ref-websocket-protocol
    - ref-screen-composition-patterns
    - ref-workspace-journey-test-contracts
    - rule-bun-test-conventions
    - rule-journey-test-coverage
    - rule-rule-strict-typescript
    - rule-ui-component-usage
---

## Goal

Cross-session project coordination — durable shared todos, file claims, worktrees, and rules. EventStore-backed JSONL persistence with NATS JetStream distribution and MCP tool interface.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | EventStore mutations and state | c3-201 |
| IN | Read model derivation | c3-214 |
| OUT | Coordination snapshots via NATS | c3-205 |
| OUT | MCP tools to Claude sessions | c3-210 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-event-sourcing | Coordination events follow append-only JSONL pattern |
| ref-ref-websocket-protocol | Snapshot publishing uses same dual-channel pattern |
| ref-screen-composition-patterns |  |
| ref-workspace-journey-test-contracts |  |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-bun-test-conventions | All test files follow Bun test patterns |
| rule-rule-strict-typescript | Strict types, no any |
| rule-error-extraction | Safe error extraction in tool handlers |
| rule-ui-component-usage |  |
| rule-journey-test-coverage |  |
## Container Connection

Extends event-store (c3-201), read-models (c3-214), and nats-transport (c3-205) with project coordination.

**Files:**

- `src/server/coordination-mcp.ts` — MCP server with 12 tools
- `src/server/coordination-mcp.test.ts`
- `src/server/event-store-coordination.test.ts`
- `src/server/read-models-coordination.test.ts`
- `src/server/coordination-integration.test.ts`
- `src/shared/project-agent-types.ts` (shared with other components)
