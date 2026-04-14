---
id: c3-217
c3-seal: c5d06e7f67837e0b3660ac45705be251885810b77fc01c97807082c51ddaf84c
title: session-discovery
type: component
category: feature
parent: c3-2
goal: Discover provider session history, merge it with Tinkaria chats, resolve resume files, and import CLI transcript context into persisted chats.
uses:
    - ref-component-identity-mapping
    - ref-external-source-authority-boundaries
    - ref-ref-event-sourcing
    - ref-session-discovery-internal-workflows
    - rule-error-extraction
    - rule-external-source-stale-handle-guards
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
---

## Goal

Discover provider session history, merge it with Tinkaria chats, resolve resume files, and import CLI transcript context into persisted chats.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Project IDs and persisted chat state for Tinkaria-backed sessions | c3-201 |
| IN | Shared session snapshot and transcript entry types | c3-204 |
| IN | Session snapshot refreshes and resume/import call sites | c3-205 |
| OUT | Project-scoped sessions snapshots for the client session picker | c3-205 |
| OUT | Imported transcript entries appended into the event-sourced chat store | c3-201 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-event-sourcing | Imports external CLI transcript context by appending normalized entries into the persistent Tinkaria store |
| ref-component-identity-mapping |  |
| ref-session-discovery-internal-workflows |  |
| ref-external-source-authority-boundaries |  |
## Related Rules

| Rule | Role |
| --- | --- |
| rule-error-extraction | File-system scanning and transcript parsing must handle malformed inputs safely |
| rule-prefixed-logging | Background import and lookup failures log through the shared prefix |
| rule-rule-bun-runtime | Server-side implementation stays on Bun-compatible runtime APIs |
| rule-rule-strict-typescript | Session metadata and transcript parsing stay strictly typed |
| rule-external-source-stale-handle-guards |  |
## Code References

| File | Purpose |
| --- | --- |
| src/server/session-discovery.ts | Scan Claude and Codex session files, merge Tinkaria and CLI sessions, resolve resume files, and import recent transcript entries |
## Container Connection

Part of c3-2 (server). This is the session-history boundary between external Claude/Codex CLI artifacts on disk and Tinkaria's live NATS/session runtime.
