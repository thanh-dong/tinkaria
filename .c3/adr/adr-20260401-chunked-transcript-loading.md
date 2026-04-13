---
id: adr-20260401-chunked-transcript-loading
c3-seal: 8549be3cfbb6390fc91606cbb2a82f70adf1780000fcf95c2ece532b8ec9cabe
title: chunked-transcript-loading
type: adr
goal: Replace one-shot transcript loading with a tail-first strategy and payload-safe chunking. Only load the last N messages the user actually sees, and degrade oversized `chat.getMessages` requests into smaller ranges instead of falling back to an empty transcript.
status: implemented
date: "2026-04-01"
---

## Goal

Replace one-shot transcript loading with a tail-first strategy and payload-safe chunking. Only load the last N messages the user actually sees, and degrade oversized `chat.getMessages` requests into smaller ranges instead of falling back to an empty transcript.

**Problem:** a single `chat.getMessages` request could exceed NATS `max_payload` on screenshot-heavy or tool-heavy chats, leaving transcript surfaces blank even though `ChatSnapshot.messageCount` already told the client how many entries existed.

**Decision:** use `ChatSnapshot.messageCount` to compute a tail offset (`max(0, total - 200)`), fetch the tail first, and route transcript fetches through a shared range helper that halves the request window when transport payload limits are hit. Keep older-message backfill only for metadata-only tail windows.

**Implementation:** `useTranscriptLifecycle.ts` now performs the tail-first load through `fetchTranscriptRange()` from `appState.helpers.ts`; the same helper is reused by the subagent session inspector so both transcript surfaces survive payload-bound chats without server changes.

**Flow:**

1. Subscribe and receive `ChatSnapshot.messageCount`
2. Fetch the last transcript window with `offset = max(0, total - 200)`
3. If the transport rejects the range with `max_payload`, retry with smaller chunks until the range is recovered or the minimum chunk fails
4. Continue streaming live events via JetStream, with targeted backfill only when the fetched tail has no renderable history
