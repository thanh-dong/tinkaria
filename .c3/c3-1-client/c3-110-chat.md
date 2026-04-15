---
id: c3-110
c3-seal: d6fd3ef7bca0f8e4cb0676f6dde815ee20f13a46b5476c867bd1a8063f9ea39d
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
| detached | User scrolled away manually. No auto-scroll. | Visible if messageCount > 0 |
Transitions:

- `anchoring` + initial-scroll-done(tail) -> `following`
- `anchoring` + initial-scroll-done(block) -> `detached`
- `following` + manual-scroll-away -> `detached`
- `detached` + scroll-to-bottom or tail sentinel visible -> `following`
- any state + chat-changed -> `anchoring`
### Read Signal

Chats carry an `unread` boolean from the server sidebar snapshot. `chat.markRead` is sent only when the active chat is visible, focused, loaded in sidebar data, and unread. Background queue processing does not mark a chat read; read state remains tied to actual user focus.

### Submit Pipeline

The client pipeline owns composer-local UX only: queued text preview, duplicate-blocking state, direct-submit busy acknowledgement, and local draft clearing. It no longer owns queued turn execution.

| Mode | Meaning |
| --- | --- |
| idle | No queued text, not submitting. Ready for new submission. |
| queued | Text accepted locally while the agent is processing. Client is awaiting backend queue acceptance. |
| flushing | Legacy machine state retained for failure recovery tests; queued execution is now server-owned. |
| awaiting_busy_ack | Direct submit sent, waiting for server to report busy status back. |
| blocked | Duplicate failed flush text detected by the local state machine. |
Decision tree on submit:

1. No activeChatId -> `handleSend()` directly, creating or targeting a chat.
2. Agent processing, queue exists, flushing, or awaiting busy ack -> `queueSubmit()` updates local preview, then `socket.command({ type: "chat.queue", chatId, content, provider, model, modelOptions, planMode })` sends the queued turn to the server.
3. Backend accepts `chat.queue` -> `clearQueuedSubmit()` clears the local queued preview; server owns eventual execution.
4. Otherwise -> `startDirectSubmit()` -> `handleSend()` -> mode = `awaiting_busy_ack` until runtime status arrives.
Queue execution is server-owned: `RunnerProxy.queue()` persists/coalesces queued content in c3-201, and `RunnerProxy.drainQueuedTurn()` starts it after c3-226 observes the active turn settle. This keeps queued work moving when the user leaves the chat screen or the frontend subscription is gone.

### handleSend Flow

1. Resolve project/workspace from chat snapshot, sidebar, or fallback path.
2. Check provider compatibility; incompatible active sessions fork instead of mutating provider identity.
3. `scrollFollowToBottom("auto")` for visible direct submits.
4. `socket.command({ type: "chat.send", chatId, workspaceId, provider, content, model, modelOptions, planMode })`.
5. If a new chat is created, navigate to `/chat/{chatId}`.
### Fork Session Flow

Fork creates a new chat, generates a compact seed prompt from the parent session, and sends that prompt as the first message in the fork. Forked chats run independently without parent-child orchestration ownership.

### Merge Session Flow

Merge creates a new chat, compacts selected source sessions into a synthesized brief, sends it as the first message, and optionally deletes source chats after the merge session is created.

### Sticky Chat Focus

`useStickyChatFocus` restores composer focus after safe pointer interactions, Escape during generation, or `tinkaria:restore-chat-input-focus`, while respecting overlays, text selection, focus-fallback opt-outs, and mobile sidebar state.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | NATS snapshot updates from server | c3-205 |
| OUT | Chat/message commands via NATS request/reply | c3-205 |
| IN | Transcript lifecycle state and hydrated message handoff | c3-118 |
| IN | Rendered transcript rows and scroll behavior | c3-119 |
## Container Connection

Part of c3-1 (client). The primary feature — renders at /chat/:chatId route. Composes chat-input, messages, terminal, and right-sidebar into a unified workspace.
