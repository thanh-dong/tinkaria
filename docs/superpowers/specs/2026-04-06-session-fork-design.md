# Session Fork (Delegation) — Design Spec

**Date:** 2026-04-06  
**Status:** Draft

---

## Problem

A user deep in a chat session often wants to branch off to explore an alternative direction or delegate a specific sub-task to a fresh session with a different model. Today, the only way to do this is:
1. Manually create a new chat from the sidebar
2. Re-type or copy-paste context into it

The navbar "compose" button (`SquarePen`) exists but is never used — it creates a blank chat with no context path.

---

## Goal

Let users quickly spin up a new, independent session from inside an existing one, seeding it with context they write, targeting a specific provider/model — without leaving the current session's flow until they choose to.

---

## User Flow

1. User is in a running chat session
2. Clicks the **Fork button** in `ChatNavbar` (replaces the unused `SquarePen` new-chat icon)
3. A **dialog** opens with:
   - Textarea: "Start the new session with..." (autofocused)
   - Compact provider + model selector row (defaults to current session's preferences)
   - "Create Session" button (disabled if textarea is empty or request is in flight)
   - "Cancel" button
4. User writes their context/instructions, optionally changes the model, clicks Create
5. New chat is created, context is sent as the first message, turn starts immediately
6. User is navigated to the new chat

The forked session is **fully independent** — no parent-child link, no lineage tracking.

---

## Architecture

### What changes

| Location | Change |
|----------|--------|
| `ChatNavbar.tsx` | Replace `onNewChat: () => void` prop with `onFork: (args: ForkArgs) => Promise<void>`. Button icon changes from `SquarePen` → `GitFork` (or similar). |
| New: `ForkSessionDialog.tsx` | Self-contained dialog component in `src/client/components/chat-ui/`. Owns context text state and provider/model selection state. |
| `ChatPage.tsx` | Wire `onFork` handler: create chat + send message + navigate. |
| `useTinkariaState.ts` | Expose `forkSession(context, provider, model)` function. |

### What does NOT change

- Server: no new NATS commands. `chat.create` + `chat.send` are sufficient.
- Events: no new event types.
- `SessionOrchestrator`: untouched — that handles agent-driven delegation, not user-driven forks.
- Sidebar new-chat action (if present): remains for empty chat creation.

---

## Component Design

### `ForkSessionDialog`

```
Props:
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  defaultProvider: AgentProvider
  defaultModel: string
  availableProviders: ProviderCatalogEntry[]
  onFork: (context: string, provider: AgentProvider, model: string) => Promise<void>

State:
  context: string          // textarea value
  provider: AgentProvider  // picker, initializes from defaultProvider
  model: string            // picker, initializes from defaultModel
  pending: boolean         // true while chat.create + chat.send in flight

Behavior:
  - Textarea autofocuses on open
  - "Create Session" disabled when context.trim() === "" or pending === true
  - On confirm: calls onFork(context, provider, model), then dialog closes on completion
  - On cancel / escape: clears context, closes dialog

Model picker:
  - Provider selector + model selector only
  - Reuses InputPopover + PopoverMenuItem from ChatPreferenceControls
  - No reasoning effort, no plan mode, no context window — those are session-level 
    preferences set after the user arrives in the new session [ASSUMED]
```

### `ChatNavbar` change

```diff
- onNewChat: () => void
+ onFork: () => void   // opens the dialog (dialog state lives in ChatPage)

- <Button onClick={onNewChat} title="Compose">
-   <SquarePen className="size-4.5" />
+ <Button onClick={onFork} title="Fork session">
+   <GitFork className="size-4.5" />
  </Button>
```

The `ForkSessionDialog` is rendered in `ChatPage` alongside the navbar, controlled by a `forkDialogOpen` boolean in local state.

### `useTinkariaState` / `ChatPage`

```typescript
async function forkSession(context: string, provider: AgentProvider, model: string) {
  const { chatId } = await socket.command({ type: "chat.create", projectId })
  await socket.command({
    type: "chat.send",
    chatId,
    text: context,
    provider,
    model,
    modelOptions: defaultModelOptions(provider, model),
  })
  navigate(`/chat/${chatId}`)
}
```

Default model options (reasoning effort, etc.) are pulled from `chatPreferencesStore` provider defaults for the chosen provider — same defaults used when starting any fresh session.

---

## Edge Cases

| Case | Handling |
|------|----------|
| User opens dialog, closes without submitting | Context is cleared on close. No chat created. |
| `chat.create` or `chat.send` fails | Show error state in dialog, keep dialog open, context preserved for retry. |
| User forks while current session is active/running | No restriction — fork creates an independent session, current session unaffected. |
| Provider not available (e.g., Codex not configured) | Picker only shows configured providers (same data as ChatInput's `availableProviders`). |

---

## Out of Scope

- AI-generated context summarization (user writes context manually)
- Session lineage / fork tree visualization
- Merging results from forked sessions back to parent
- Agent-initiated forks (covered by existing `SessionOrchestrator` + `spawn_agent` tool)

---

## Files Touched

```
src/client/components/chat-ui/ForkSessionDialog.tsx   [new]
src/client/components/chat-ui/ChatNavbar.tsx           [modify]
src/client/app/ChatPage.tsx                            [modify]
src/client/app/useTinkariaState.ts                     [modify, add forkSession]
```

No server files, no shared types, no new events.
