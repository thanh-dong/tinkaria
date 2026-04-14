---
id: c3-118
c3-seal: 8ae4c2929e9a7fe013016080bcd5b459f0ad7e600ca723d1ce6012698accd854
title: transcript-lifecycle
type: component
category: feature
parent: c3-1
goal: 'Own live transcript ingestion on the client: cache restore, snapshot/tail fetch, backfill, event buffering, incremental hydration, RAF batching, and message-array handoff to the transcript renderer.'
uses:
    - c3-106
    - c3-204
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Own live transcript ingestion on the client: cache restore, snapshot/tail fetch, backfill, event buffering, incremental hydration, RAF batching, and message-array handoff to the transcript renderer.

### Hook API

`useTranscriptLifecycle(args)` returns:

| Field | Type | Purpose |
| --- | --- | --- |
| messages | HydratedTranscriptMessage[] | Hydrated message array for rendering |
| messagesRef | RefObject | Stable ref synced via useLayoutEffect |
| messageCountRef | RefObject number | Total entry count from server |
| chatSnapshot | ChatSnapshot or null | Latest chat metadata snapshot |
| orchestrationHierarchy | OrchestrationHierarchySnapshot or null | Delegated session tree |
| chatReady | boolean | True once initial data is available for rendering |
### Lifecycle Phases

The hook executes five ordered phases when a chat becomes active:

**Phase 1 — Cache Restore** (immediate, synchronous feel)

1. Call `getCachedChat(activeChatId)` on mount
2. If cache exists: restore hydrator state, set messages, set `chatReady = true` immediately
3. Stale cached content renders while fresh data loads — no blank screen
4. Hydrator's `seenEntryIds` set prevents duplicate processing when fresh entries arrive
**Phase 2 — Socket Subscription + Snapshot**

1. Subscribe to socket channel `{ type: "chat", chatId }`
2. Wait for snapshot callback containing `messageCount`
3. If no snapshot arrives within `SNAPSHOT_RECOVERY_TIMEOUT_MS`, trigger `fetchTailFallback()` which fetches from offset 0
**Phase 3 — Tail Fetch + Backfill**

1. `fetchTail(messageCount)` computes offset via `computeTailOffset(messageCount)`
2. Fetches `fetchTranscriptRange({ socket, chatId, offset, limit: TRANSCRIPT_TAIL_SIZE })`
3. Processes entries through `processTranscriptMessages(entries)` for preview
4. If window needs backfill (entries reference earlier context), loops to fetch earlier chunks and prepend
5. Calls `flushTail(entries, "fetched")` to commit
**Phase 4 — Buffer Flush**

1. Before Phase 3 completes, live events arriving via socket are buffered in a `buffer: TranscriptEntry[]` array
2. `flushTail()` sets `initialFetchDone = true`, merges `[...fetchedEntries, ...buffer]`
3. Resets hydrator only if NOT restored from cache (avoids losing cache state)
4. Hydrates all combined entries, clears buffer
**Phase 5 — Streaming (steady state)**

1. Each incoming event calls `hydrator.hydrate(entry)`
2. RAF batching: if no pending frame, schedule `requestAnimationFrame`
3. Inside RAF callback: call `hydrator.getMessages()` once, `setMessages()` once
4. Multiple events within one frame coalesce into a single React render
### Hydration Mechanics (parseTranscript.ts)

The `IncrementalHydrator` maintains closure state:

- `pendingToolCalls`: Map keyed by toolId, holding `{ hydrated: HydratedToolCall, normalized: NormalizedToolCall }`
- `messages`: HydratedTranscriptMessage[]
- `seenEntryIds`: Set for deduplication
- `dirty`: boolean controlling array identity
**Critical mutation pattern for tool_result:**

1. `tool_call` entry arrives → hydrated, stored in `pendingToolCalls` map
2. `tool_result` entry arrives → looks up pending call by `toolId`
3. Attaches result to hydrated tool call **in-place** (mutation): `pendingCall.hydrated.result = ...`
4. Returns `null` — tool_result does NOT become a separate message
5. Sets `dirty = true` so `getMessages()` creates `[...messages]` — new array reference triggers React repaint
This in-place mutation + new-array-ref pattern is the key invariant. Breaking it (e.g., forgetting to set dirty) silently loses tool results in the UI.

### Unmount + Cache Save

On unmount or chat switch: saves current hydrator, messages, messageCount, and timestamp via `setCachedChat()` so next visit starts from Phase 1 cache restore.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Chat snapshots and transcript events from WebSocket/NATS client state | c3-110 |
| IN | Shared transcript entry and tool result shapes | c3-204 |
| OUT | Hydrated transcript messages and message-count/cache state | c3-119 |
| OUT | Structured artifact tool results for present_content render path | c3-106 |
## Container Connection

Part of c3-1 (client). This component explains why live transcript state is not just route state: it bridges server event order into stable hydrated UI messages before rendering decisions happen.
