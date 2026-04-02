# Chat Queue

Allow follow-up prompts to be staged while the current turn is still running, without forcing the user to interrupt the session or lose what they typed.

## Goal

Today, once a chat turn is in progress, the composer effectively becomes send-blocked. The user can keep typing in the textbox, but there is no explicit queueing model, no visible outbox, and no path to submit a follow-up message without interfering with the current session. The desired behavior is closer to Claude Code: while the agent is still inferring, the user can stage the next prompt and trust Kanna to send it when the runtime is ready.

This feature is intentionally simple:

- Keep normal send behavior unchanged when there is no active turn and no queued text.
- While a turn is active, `Send` should stage the current textarea contents instead of sending immediately.
- All staged content is treated as one unsent text buffer, rendered as multiple paragraphs rather than multiple discrete queue items.
- The staged text remains editable until it is actually sent.
- Pressing `ArrowUp` on an empty composer should restore the full staged text into the textarea and clear the queue.

## Non-Goals

- No per-item queue metadata, reordering, or partial dequeue.
- No server-side queue persistence.
- No transcript-level representation for queued content before it is sent.
- No change to `ask_user_question` or other tool-response flows.

## User Experience

### Idle path

If there is no queued text and the runtime is idle, the composer behaves exactly as it does today:

1. User types a message.
2. User submits.
3. Kanna sends the message immediately.

### Busy path

If the runtime is busy:

1. User types a follow-up prompt.
2. User submits.
3. Kanna appends that prompt to the queued buffer as another paragraph.
4. The textarea clears so the user can continue drafting.
5. A simple `Queue` block appears above the composer, showing the full unsent text.

Repeated queue submits keep appending paragraphs to the same queued buffer.

Example queue surface:

```text
Queue

Check the failing mobile layout.

Also verify whether the right sidebar still opens after the fix.
```

### Editing queued text

The queue remains unsent client state until flushed. The user can:

- Clear the entire queue from the queue surface.
- Press `ArrowUp` while the textarea is empty to pull the full queued buffer back into the composer for editing.

Restoring the queue into the composer unqueues it. At that point, the textarea once again owns the full text and the queue surface disappears.

### Auto-flush

When the runtime transitions from busy to idle and queued text exists:

1. Kanna submits the full queued buffer as a normal user prompt.
2. The queue clears only after the send path has been accepted.
3. If send fails, the queued text is restored and remains visible.

The queued text is sent as one message, preserving paragraph breaks.

## Data Model

Use a single client-side queue buffer:

```typescript
interface ChatQueueState {
  queuedText: string
}
```

This is intentionally not modeled as an array of queue items. The UI and behavior both treat the queue as one editable body of unsent text.

## C3 Context

This change lives inside existing C3-mapped client components:

- `c3-110` `chat` owns `useKannaState` and the active runtime/send lifecycle.
- `c3-112` `chat-input` owns textarea behavior, submit ergonomics, and composer controls.

Expected file lookups before implementation:

- `src/client/app/useKannaState.ts` -> `c3-110`
- `src/client/app/ChatPage.tsx` -> `c3-110`
- `src/client/components/chat-ui/ChatInput.tsx` -> `c3-112`

No new component is expected. This should remain a focused update inside the existing chat/chat-input topology unless implementation pressure proves otherwise.

## C3 Refs And Rules To Honor

### Refs

- `ref-ref-websocket-protocol`: keep queueing entirely client-side until flush time; only the actual send path should cross the socket boundary through the existing typed `chat.send` command path.
- `ref-ref-zustand-stores`: keep queue state narrowly scoped and easy to reason about. If persistence is needed, use a small store or existing store pattern rather than broad component-local sprawl. If persistence is not needed, keep state local to the feature boundary and do not leak it into unrelated stores.
- `ref-ref-provider-abstraction`: queued sends must preserve the same provider/model/modelOptions contract as immediate sends. Queueing is a transport-timing concern, not a provider-specific code path.

### Rules

- `rule-bun-test-conventions`: all new tests stay in Bun, co-located, and use focused `describe`/`test` coverage for queueing, restore, flush, and failure paths.
- `rule-prefixed-logging`: any added client debug tracing must use module-prefixed `console.info()` style, consistent with `[useKannaState]` and `[ChatInput]`.
- `rule-rule-strict-typescript`: no `any`, no loose queue payloads, and explicit narrow helpers around flush/restore state.

## Implementation Shape

### `useKannaState`

`useKannaState` should own queue state and flushing because it already owns:

- Runtime status (`isProcessing`, `runtime?.status`)
- The canonical `handleSend()` path
- Command error handling
- Chat lifecycle transitions

Additions:

- `queuedText` state
- `queueMessage(content)` helper that appends with paragraph separation
- `restoreQueuedText()` helper
- `clearQueuedText()` helper
- `flushQueuedText()` guard that sends once when runtime becomes idle

Important behavior:

- `handleSend()` remains the transport-level send path for immediate sends.
- A wrapper entry point should decide between immediate send and queueing based on runtime state.
- Auto-flush must be guarded against duplicate firing across rerenders.
- Queue state should stay minimal and typed so it is obvious when content is draft text versus queued unsent text.

### `ChatInput`

`ChatInput` should stay responsible for textarea ergonomics and keyboard behavior.

Additions:

- Receive `queuedText`
- Render a simple queue block above the composer when `queuedText` is non-empty
- Render a clear action for the full queue
- On `ArrowUp` with an empty textarea, call `onRestoreQueue()` if queued text exists

Submit behavior:

- If the wrapper says "send now", existing behavior stays intact.
- If the wrapper says "queue", the textarea still clears, but no network command is sent.
- `ArrowUp` restore should remain a pure client interaction and must not touch socket state.

### `ChatPage`

`ChatPage` just threads queue props from `useKannaState` into `ChatInput`.

No new architectural responsibility should be added there.

## Error Handling

- If queue flush send fails, restore the queued text and keep it visible.
- If the user restores the queue into the composer, no automatic flush should happen until they submit again.
- If the runtime becomes busy again before a flush starts, do nothing and wait for the next idle transition.

## Testing

Follow RED-GREEN-TDD with focused client tests.

### Delivery discipline

- Start RED first: add failing tests for queueing, restore, and auto-flush before changing implementation.
- GREEN with the minimum code needed to satisfy each test.
- Do a no-slop pass, then a simplify pass, then a review pass before calling the feature done.
- Maximize parallelism where it is genuinely independent: queue state tests and input interaction tests can be developed/verified separately, but the final integration path must still prove end-to-end client behavior.

### `useKannaState` tests

- Immediate send still calls `chat.send` when idle and queue is empty.
- Busy submit queues text instead of calling `chat.send`.
- Multiple busy submits append paragraphs to `queuedText`.
- Idle transition flushes queued text exactly once.
- Failed flush restores queued text.

### `ChatInput` tests

- Queue block renders when `queuedText` is present.
- Clear action removes the queued text.
- `ArrowUp` on an empty textarea restores the queued text.
- `ArrowUp` does nothing when the textarea already contains text.

### Regression checks

- Existing send-on-enter behavior still works when queue is empty.
- Existing cancel behavior is unchanged.
- Draft persistence remains scoped to the live textarea draft, not the queued buffer.
- Provider/model submission options remain identical between immediate send and queued flush.

## Risks

### Duplicate auto-send

The runtime can rerender multiple times around state transitions. The flush logic needs an explicit in-flight guard so the queued text is sent once per idle window.

### Draft/queue confusion

The composer already persists drafts by chat id. Queue state must remain distinct so restoring queued text does not accidentally look like a stale saved draft.

### Busy-state correctness

The queue/send decision should rely on the same runtime signal that currently powers `canCancel` and disabled send behavior, otherwise the UI and behavior can diverge.

## Minimal File Scope

- Modify `src/client/app/useKannaState.ts`
- Modify `src/client/components/chat-ui/ChatInput.tsx`
- Modify `src/client/app/ChatPage.tsx`
- Add or update focused client tests near those files

## C3 Update And Audit After Implementation

After code lands:

1. Run `c3x lookup` again on each touched file and do the ref-compliance check against the refs/rules above.
2. Update the ADR status from `proposed` to `implemented` once verification is complete.
3. If the final implementation changes component boundaries or introduces new files outside the mapped scope, update C3 entities/codemap accordingly rather than leaving drift.
4. Run `c3x check` as the final architecture audit gate.

## Acceptance Criteria

- While a turn is running, the user can submit follow-up text without interrupting the current turn.
- Staged follow-up text is visible above the composer as one multi-paragraph queue block.
- The user can clear the staged queue or restore it into the composer with `ArrowUp` on an empty textarea.
- Once the runtime is idle, queued text sends automatically as the next normal message.
- If no queue exists and the runtime is idle, send behavior is unchanged from today.
