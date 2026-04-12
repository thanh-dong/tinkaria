# Actionable Transcript Error Messages

**Date:** 2026-04-12
**Status:** Draft (rev 2 — addresses Codex review)
**Approach:** Component-local enrichment (Approach A)

## Problem

Error messages in the transcript area are terse and non-actionable. "Failed", "The session ended unexpectedly", and raw error dumps give users no guidance on what happened or what to do next.

## Goal

Every error message tells the user: (a) what happened, (b) why it might have happened, (c) what they can do about it. Interactive buttons trigger real operations where possible. Tone: calm, not alarming.

## Core Model

### EnrichedError type

```ts
// src/client/app/appState.helpers.ts

export interface ErrorAction {
  label: string                                    // "Retry", "Dismiss", "Try again"
  variant: "default" | "ghost" | "destructive"
  action: string                                   // semantic key mapped by component
}

export interface EnrichedError {
  message: string         // what happened (short, bold)
  hint?: string           // why + what to do (muted sub-text)
  actions?: ErrorAction[] // interactive buttons
}
```

Both types are defined and exported from `src/client/app/appState.helpers.ts` (client-only).

### Callback delivery — `useTranscriptActions()` context

**Problem identified by review:** Adding `onRetry`, `onNewChat`, `onResume`, `onRetryInit` etc. as props would balloon the `ChatTranscript` interface (currently clean `{ messages, currentStatus }`).

**Solution:** Create a `TranscriptActionsContext` provider wrapping the transcript in `ChatPage.tsx`. Components read actions via `useTranscriptActions()` hook instead of receiving props.

```ts
// src/client/app/TranscriptActionsContext.ts

interface TranscriptActions {
  onRetryChat: () => void             // re-create current chat
  onNewChat: () => void               // create fresh chat in workspace
  onResumeSession: (() => void) | null // resume if session is resumable, null otherwise
  onDismissError: () => void          // clear commandError / processing error
  onRetryBootstrap: (() => void) | null // retry fork/merge with stored params
}

const TranscriptActionsContext = createContext<TranscriptActions | null>(null)
export const useTranscriptActions = () => useContext(TranscriptActionsContext)
```

`ChatPage.tsx` provides this context, wiring to existing `state.handleCreateChat`, `state.handleResumeSession`, `state.dismissBootstrapError`, etc. No prop drilling through `ChatTranscript`.

### `commandError` — additive, non-breaking approach

**Problem identified by review:** Changing `commandError` from `string | null` to `EnrichedError | null` would break 8+ consumer sites that render `{commandError}` as JSX text (`ChatPage.tsx:598`, `LocalDev.tsx:381,798`) and `setCommandError("string")` calls.

**Solution:** Keep `commandError: string | null` untouched. Add a separate enrichment step at the rendering site:

```ts
// src/client/app/appState.helpers.ts
export function enrichCommandError(raw: string): EnrichedError { ... }
```

`ChatPage.tsx` calls `enrichCommandError(state.commandError)` when rendering the banner. `LocalDev.tsx` and all other consumers continue using the raw string unchanged. Zero breaking changes.

## Retry Strategy Matrix

**Problem identified by review:** The spec conflated three different retry scenarios.

| Scenario | Trigger | Retry mechanism | Complexity |
|---|---|---|---|
| **Turn failed** | `ResultMessage` with `!success && !cancelled` | Re-send last user message via `handleSend` | Trivial — just replay |
| **Session bootstrap failed** | `ProcessingMessage` status `"failed"` | Re-create chat via `handleCreateChat` | Low — params available |
| **Fork/merge bootstrap failed** | `PendingSessionBootstrap` phase `"error"` | Re-invoke with stored params | Medium — store params |
| **Session corrupt** (wedged) | Not distinguishable in current model | Out of scope (Phase 2) | High — needs fork+merge extraction |

**Phase 1 (this spec):** Covers rows 1–3 only. Session-corrupt retry is deferred.

## Per-Component Changes

### 1. ProcessingMessage — "Failed" status

**File:** `src/client/components/messages/ProcessingMessage.tsx`

**Before:** Red `X` icon + "Failed" text.

**After:**
- Icon: `AlertCircle` (softer than `X`)
- Message: **"Session failed to start"**
- Hint: "The CLI process exited before it could respond."
- Actions: **[Try again]** (ghost button), **[Dismiss]** (ghost)

**Callback delivery:** Reads `useTranscriptActions()` — `onRetryChat` re-creates the chat, `onDismissError` clears processing state.

**Prop-drilling path:** None needed. `ProcessingMessage` is rendered directly in `ChatPage.tsx:592`, not via `ChatTranscript`. It already has access to the `TranscriptActionsContext` provider wrapping the transcript area.

### 2. ResultMessage — Session ended unexpectedly

**File:** `src/client/components/messages/ResultMessage.tsx`

**Before:** "The session ended unexpectedly." in a `bg-destructive/10` block.

**After:**
- Message: **"Session ended unexpectedly"** (no trailing period)
- Hint: contextual pattern matching on `message.result`:
  - Contains "signal" → "The process was interrupted by a system signal."
  - Contains "OOM" or "out of memory" → "The process ran out of memory."
  - Default → "This usually means the CLI process crashed or was killed."
- Actions: **[Start new chat]** (default), **[Resume session]** (ghost, only if `onResumeSession` is non-null)

**Callback delivery:** Reads `useTranscriptActions()` — `onNewChat` and `onResumeSession`.

### 3. InterruptedMessage / ResultMessage cancelled

**File:** `src/client/components/messages/InterruptedMessage.tsx`, `ResultMessage.tsx`

**Before:** "Interrupted" pill with `CircleSlash` icon.

**After:**
- Pill: **"Interrupted"** (unchanged — clean design)
- Below pill: muted hint text "Send a new message to continue this conversation."

No buttons — the composer itself is the action. Minimal change, maximum clarity.

### 4. ToolCallMessage — "Error" label in expanded result

**File:** `src/client/components/messages/ToolCallMessage.tsx`

**Before:** Code block labeled "Error" with raw error text.

**After:** Add a muted hint line above the raw error code block, based on pattern matching:

| Error pattern | Hint |
|---|---|
| `permission denied` | "The tool couldn't access a file. Check file permissions." |
| `command not found` | "The command isn't installed or isn't in PATH." |
| `timeout` / `timed out` | "The operation took too long." |
| `ENOENT` / `no such file` | "A referenced file or directory doesn't exist." |
| Hard error (default) | No extra hint — raw text is sufficient context |

No buttons — tool errors are informational. The AI agent retries or adjusts.

**Implementation:** New `getToolErrorHint(result: string): string | null` helper in the same file, called only when `message.isError && !isSoftError(message.result)`.

### 5. ChatPage commandError banner

**File:** `src/client/app/ChatPage.tsx`, `src/client/app/appState.helpers.ts`

**Before:** Plain text in a destructive-styled div.

**After:** `enrichCommandError(raw)` returns `EnrichedError` at render time:

| Error | Message | Hint | Actions |
|---|---|---|---|
| `"not connected"` | "Can't reach the server" | "Make sure Tinkaria is running on this machine." | **[Dismiss]** |
| connection closed / socket closed | "Connection dropped" | "Reconnecting automatically..." | **[Dismiss]** |
| `"Unknown command type: system.readLocalFilePreview"` | "Client is newer than server" | "Restart Tinkaria to enable in-app file previews." | **[Dismiss]** |
| Other | Normalized error text | (none) | **[Dismiss]** |

**No state type change.** `commandError` remains `string | null`. Enrichment is a pure function applied at render time in `ChatPage.tsx` only. `LocalDev.tsx` and all other consumers are unaffected.

### 6. Fork/Merge failed overlay

**File:** `src/client/app/ChatPage.tsx`, `src/client/app/appState.helpers.ts`

**Before:** "Fork failed" / "Merge failed" + optional error message + [Dismiss].

**After:**
- Message: **"Fork failed"** / **"Merge failed"** (unchanged)
- Hint: contextual:
  - Timeout → existing text (already good)
  - Contains "busy" or "already running" → "The target session is currently busy. Wait for it to finish or pick a different session."
  - Default → normalized error text
- Actions: **[Try again]** (default) + **[Dismiss]** (ghost, existing)

**Retry mechanism:** `PendingSessionBootstrap` error phase stores the original invocation params (`intent`, `provider`, `model`, `preset`, and for merge: `chatIds`, `closeSources`). The **[Try again]** button reads these stored params and re-invokes `handleForkSession` or `handleMergeSession`.

**State change:** Add optional `retryParams` to `PendingSessionBootstrap`:

```ts
retryParams?: {
  intent: string
  provider: AgentProvider
  model: string
  preset?: string
  // merge-only:
  chatIds?: string[]
  closeSources?: boolean
}
```

Set at bootstrap initiation time in `useChatCommands.ts` where all params are available.

### 7. SystemMessage MCP server states

**File:** `src/client/components/messages/SystemMessage.tsx`

**Before:** "Failed" / "Needs auth" / "Disabled" / "Connecting..." labels.

**After:**

| Status | Label | Hint (below label) |
|---|---|---|
| `failed` | **"Connection failed"** | "Check the MCP server process." |
| `needs-auth` | **"Needs authentication"** | "Re-authenticate to reconnect." |
| `disabled` | **"Disabled"** | (no change — intentional state) |
| `pending` | **"Connecting..."** | (no change) |

No buttons — MCP server management is external to the app.

### 8. LocalDev.tsx commandError (additional consumer)

**File:** `src/client/components/LocalDev.tsx`

**No change required.** Since `commandError` stays `string | null`, the `ConnectionStatusCard` (line 640) and workspace card (line 796–798) continue rendering the raw string. These are outside the transcript area and are out of scope for enrichment in this phase.

## Shared Button Styling

All error action buttons use the existing `Button` component from `src/client/components/ui/button.tsx` with `size="sm"` and the specified `variant`. They render inline within each error's natural layout (pill, banner, overlay, etc.).

## Testing Strategy

### Unit tests

| Test target | Assertions |
|---|---|
| `enrichCommandError()` | Returns correct `EnrichedError` for each error pattern (not connected, connection dropped, version mismatch, unknown) |
| `normalizeSessionBootstrapErrorMessage()` | Returns correct hint for timeout, busy, and default errors |
| `getToolErrorHint()` | Returns correct hint for each pattern, `null` for unmatched |

### Component tests

| Component | Assertions |
|---|---|
| `ProcessingMessage` | When `status="failed"`: renders AlertCircle, "Session failed to start", hint text, Try again + Dismiss buttons |
| `ResultMessage` | When `!success && !cancelled`: renders enriched message with contextual hint, action buttons |
| `ResultMessage` | When `cancelled`: renders "Interrupted" pill + hint text |
| `InterruptedMessage` | Renders hint text below pill |
| `ToolCallMessage` | When `isError && !isSoftError`: renders hint above error code block |
| ChatPage command error | Renders structured `enrichCommandError` output with dismiss button |
| ChatPage fork/merge error | Renders "Try again" button, clicking it invokes retry with stored params |

### Integration

- Verify `TranscriptActionsContext` provides actions to deeply nested transcript components
- Verify `LocalDev.tsx` still renders `commandError` as plain string (no regression)

## Files Changed

| File | Change |
|---|---|
| `src/client/app/appState.helpers.ts` | Add `EnrichedError`, `ErrorAction` types. Add `enrichCommandError()`. Update `normalizeSessionBootstrapErrorMessage()` hints |
| `src/client/app/appState.helpers.test.ts` | Tests for new enrichment functions |
| `src/client/app/TranscriptActionsContext.ts` | **New file** — `TranscriptActions` interface, context, `useTranscriptActions` hook |
| `src/client/app/useAppState.ts` | No type change to `commandError`. Add `retryParams` to `PendingSessionBootstrap` |
| `src/client/app/ChatPage.tsx` | Provide `TranscriptActionsContext`. Render structured command error via `enrichCommandError()`. Add retry to fork/merge overlay |
| `src/client/app/ChatPage.test.tsx` | Update tests |
| `src/client/app/ChatPage.test.ts` | Update tests |
| `src/client/components/messages/ProcessingMessage.tsx` | Add failed state with hint + actions via `useTranscriptActions()` |
| `src/client/components/messages/ResultMessage.tsx` | Add enriched error block + interrupt hint via `useTranscriptActions()` |
| `src/client/components/messages/InterruptedMessage.tsx` | Add hint text below pill |
| `src/client/components/messages/ToolCallMessage.tsx` | Add `getToolErrorHint()`, render hint above error code block |
| `src/client/components/messages/SystemMessage.tsx` | Update MCP status labels + hints |
| `src/client/components/LocalDev.tsx` | No change (uses raw `commandError` string — unaffected) |
| `src/client/components/chat-ui/sidebar/ChatRow.tsx` | No change (sidebar, not transcript) |

## Out of Scope

- Error analytics/telemetry
- Session-corrupt retry (requires fork+merge logic extraction — Phase 2)
- Sidebar error states (only transcript area)
- `LocalDev.tsx` error enrichment (outside transcript)
- ChatInput reconnect indicator (already well-designed, icon-only)
