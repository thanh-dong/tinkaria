---
id: c3-201
c3-seal: ef85f7f6b1e65d7606c2c9733910a120a1968cd5f80ce1cceda3b86f424f5201
title: event-store
type: component
category: foundation
parent: c3-2
goal: JSONL-based append-only event log with snapshot compaction for persisting all project, chat, and transcript state.
uses:
    - ref-component-identity-mapping
    - ref-ref-event-sourcing
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-graceful-fallbacks
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-type-guards
---

## Goal

JSONL-based append-only event log with snapshot compaction for persisting all project, chat, and transcript state.

## Dependencies

- src/shared/types.ts (STORE_VERSION, AgentProvider, TranscriptEntry)
- src/shared/branding.ts (getDataDir, LOG_PREFIX)
- src/server/events.ts (StoreEvent union types, StoreState, SnapshotFile, createEmptyState)
- src/server/paths.ts (resolveLocalPath)
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-event-sourcing | Append-only JSONL event log with snapshot compaction |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-error-extraction |  |
| rule-bun-test-conventions |  |
| rule-type-guards |  |
| rule-prefixed-logging |  |
| rule-graceful-fallbacks |  |
## Container Connection

Part of c3-2 (server). Provides the single source of truth for all persistent state — projects, chats, transcripts, and turn lifecycle events.
