---
id: c3-110
c3-seal: 4ffc2ac5b7d65f5981d2357c707f1f56f691bf47ae88eee8f951c1f70ec1d659
title: chat
type: component
category: feature
parent: c3-1
goal: 'Render the `/chat/:chatId` workspace: transcript, navbar, composer, fork-session dialog, and optional right sidebar, with live chat state managed through TinkariaState and semantic ids exposed for Alt+Shift inspection.'
uses:
    - c3-108
    - recipe-agent-turn-render-flow
    - recipe-project-c3-jtbd-flow
    - ref-component-identity-mapping
    - ref-fork-session-seeding
    - ref-live-transcript-render-contract
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
    - rule-transcript-boundary-regressions
    - rule-ui-component-usage
    - rule-ui-identity-composition
---

## Goal

Render the `/chat/:chatId` workspace: transcript, navbar, composer, fork-session dialog, and optional right sidebar, with live chat state managed through TinkariaState and semantic ids exposed for Alt+Shift inspection.

### Scroll State Machine

Three states govern auto-scroll behavior:

| State | Meaning | Scroll Button |
| --- | --- | --- |
| anchoring | Initial load. Polling scroll height every 50ms until 5 consecutive stable cycles (250ms). Timeout at 2000ms. | Hidden |
| following | At bottom. Auto-scrolls on new content via useLayoutEffect watching messages.length + status + inputHeight. | Hidden |
| detached | User scrolled away manually. No auto-scroll. | Visible (if messageCount > 0) |
**Transitions:**

- `anchoring` + initial-scroll-done(tail) → `following`
- `anchoring` + initial-scroll-done(block) → `detached`
- `anchoring` + chat-changed → `anchoring` (reset)
- `following` + manual-scroll-away → `detached`
- `following` + chat-changed → `anchoring`
- `detached` + scroll-to-bottom (user click) → `following`
- `detached` + IntersectionObserver sentinel visible → `following`
- `detached` + chat-changed → `anchoring`
**Bottom Detection:** IntersectionObserver watches a sentinel element at transcript tail. "Within bottom follow band" = within 2% of viewport height (minimum 2px). Programmatic scrolls (marked via `beginProgrammaticScroll()`) bypass manual-scroll detection to prevent false detach.

**Scroll Button:** Positioned at 120px from bottom (+ 52px if skill ribbon visible). CSS scale transition: `scale-100` visible, `scale-60 opacity-0` hidden.

### Read Signal (Unread/Read)

Chats carry an `unread` boolean from the server sidebar snapshot.

**Marking as read** happens automatically when ALL of:

1. `activeChatId` exists (user is viewing the chat)
2. Sidebar data has loaded (`sidebarReady`)
3. `chat.unread === true`
4. `document.visibilityState === "visible"`
5. `document.hasFocus() === true`
Action: `socket.command({ type: "chat.markRead", chatId })`. No manual UI trigger needed — purely passive on navigation and tab focus events.

### Submit Pipeline

Five-state machine governing message submission with queuing:

| Mode | Meaning |
| --- | --- |
| idle | No queued text, not submitting. Ready for new submission. |
| queued | Text queued while agent is processing. Waiting for turn to finish. |
| flushing | Sending queued text. Text is in flight. |
| awaiting_busy_ack | Submitted, waiting for server to report busy status back. |
| blocked | Duplicate submission detected (same text). Prevents re-sending. |
**Decision tree on submit:**

1. No activeChatId → `handleSend()` directly (creates new chat)
2. Agent processing OR already queued → `queueSubmit()` → mode = "queued"
3. Pipeline in flushing/awaiting_busy_ack → `queueSubmit()` → mode = "queued"
4. Otherwise → `startDirectSubmit()` → `handleSend()` → mode = "awaiting_busy_ack"
**Queue flush:** When processing ends (snapshot arrives with idle status), `maybeFlushQueuedSubmit()` calls `startQueuedFlush()` → sends queued text → on success: `completeQueuedFlush()` clears queue. On failure: `failQueuedFlush()` restores text back to queue.

**Blocked prevention:** `getQueuedFlushKey(chatId, text)` tracks last-failed text. If next submit matches the failed key, mode = "blocked" to prevent infinite retry loops.

### handleSend Flow

1. Resolve project/workspace (from chat snapshot, sidebar, or open fallback path)
2. Check provider compatibility — if active chat has incompatible provider, fork instead
3. `scrollFollowToBottom("auto")` — ensure user sees the response
4. `socket.command({ type: "chat.send", chatId, workspaceId, provider, content, model, modelOptions, planMode })`
5. If new chat created → `navigate(/chat/{chatId})`
### Fork Session Flow

1. User opens ForkSessionDialog from navbar
2. Selects preset (6 presets: implementation_branch, alternative_approach, bug_investigation, cleanup_refactor, tests, docs_spec)
3. Edits intent text (textarea, pre-filled from preset defaultIntent)
4. Optionally changes provider/model
5. Clicks "Create Session"
6. Client creates new chat, renames it with preview title, navigates immediately
7. Background: calls `chat.generateForkPrompt` (120s timeout) — server compacts parent transcript, applies preset generatorHint, returns seed prompt
8. Sends seed prompt as first message in forked chat
9. Forked chat runs independently — no parent-child orchestration link
### Merge Session Flow

1. User opens MergeSessionDialog from navbar
2. Searches and selects 1-5 source chats (checkbox toggle)
3. Selects preset (4 presets: synthesis, compare_decide, consolidate_progress, knowledge_base)
4. Edits intent text
5. Optionally checks "Close source sessions after merge"
6. Client creates new chat, renames, navigates immediately
7. Background: calls `chat.generateMergePrompt` (120s timeout) — server compacts each source into summary, synthesizes unified brief
8. Sends merge prompt as first message
9. If closeSources=true: deletes each source chat (errors logged, not blocking)
### Sticky Chat Focus

`useStickyChatFocus` auto-restores composer focus after pointer interactions:

- Pointer down/up outside focusable elements → focus textarea
- Escape key during generation → focus textarea
- Custom event `tinkaria:restore-chat-input-focus` → focus textarea
- Disabled when: overlay open, text selection active, element has `data-focus-fallback-ignore`, sidebar open (mobile)
Focus cycling: Tab key cycles between chat input textareas. `data-chat-input` attribute marks cycle targets.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | NATS snapshot updates from server | c3-205 |
| OUT | Chat/message commands via NATS request/reply | c3-205 |
| IN | Transcript lifecycle state and hydrated message handoff | c3-118 |
| IN | Rendered transcript rows and scroll behavior | c3-119 |
## Container Connection

Part of c3-1 (client). The primary feature — renders at /chat/:chatId route. Composes chat-input, messages, terminal, and right-sidebar into a unified workspace.
