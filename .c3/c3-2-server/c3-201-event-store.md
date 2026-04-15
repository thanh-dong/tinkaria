---
id: c3-201
c3-seal: 0e4753888f06c4f69e6e848da34e0d260b6606941c1ca9f9ce35bd6b2f5d027f
title: event-store
type: component
category: foundation
parent: c3-2
goal: JSONL-based append-only event log with snapshot compaction for persisting all project, chat, queued-turn, and transcript state.
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

JSONL-based append-only event log with snapshot compaction for persisting all project, chat, queued-turn, and transcript state.

Persistent domains:

- Projects and independent workspaces in the projects log.
- Chat metadata in the chats log.
- Turn lifecycle, session tokens, and queued chat turns in the turns log.
- Per-chat transcript files for durable message history.
- Coordination, repo, workflow, sandbox, profile, and extension-preference logs for their respective projections.
Queued turn contract:

- `chat_turn_queued` appends/coalesces one queued follow-up per chat in `queuedTurnsByChat`.
- `chat_queued_turn_cleared` removes the queued turn when `RunnerProxy.drainQueuedTurn()` claims it for execution.
- Snapshot compaction includes pending queued turns so a queued follow-up survives store replay and restart.
- Tests for queued turns must prove append/coalesce, replay, and clear behavior.
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
