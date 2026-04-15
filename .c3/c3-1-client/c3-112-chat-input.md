---
id: c3-112
c3-seal: 1799ac646484b4654ab87881bbba2c12669c717486c2fc2d0087c8c082fa0336
title: chat-input
type: component
category: feature
parent: c3-1
goal: Multi-line chat input with auto-resize, submit on Enter, cancel/queue behavior, and a preference bar for provider/model/context-window/reasoning-effort selection and plan-mode toggle.
uses:
    - ref-component-identity-mapping
    - ref-ref-provider-abstraction
    - ref-ref-radix-primitives
    - ref-ref-zustand-stores
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

## Goal

Multi-line chat input with auto-resize, submit on Enter, cancel/queue behavior, and a preference bar for provider/model/context-window/reasoning-effort selection and plan-mode toggle.

### Keyboard Behavior Matrix

| Context | Key | Action |
| --- | --- | --- |
| Agent running (canCancel=true) | Enter | Queue message through onSubmit / chat.queue path |
| Agent running | Shift+Enter | Insert newline |
| Idle (canCancel=false) | Enter (non-touch) | Submit immediately |
| Idle | Ctrl/Cmd+Enter | Submit immediately |
| Idle (touch device) | Enter | Insert newline |
| Any state | Shift+Enter | Always insert newline |
| Composer empty | Arrow Up | Restore queued text preview |
| Any | Tab | Focus next chat input |
| Any | Shift+Tab | Toggle plan mode |
| Agent running | Escape | Cancel generation |
### Send States

| State | Visual | Trigger |
| --- | --- | --- |
| idle | Arrow-up icon | Default, connection healthy |
| reconnecting | Spinner animation | WebSocket disconnected |
| reconnected | Checkmark icon for 1.2s | Just reconnected, then auto-resets to idle |
### Queue vs Submit UX

Submit mode (`canCancel=false`): the arrow button sends immediately and no cancel button is shown.

Queue mode (`canCancel=true`): the stop button cancels the current generation and the queue button submits a follow-up to the parent chat command layer. The composer may show a queued text block above the textarea while the backend queue command is being accepted. Once `chat.queue` succeeds, c3-110 clears the local preview; c3-210/c3-201 own durable queued execution behind the screen.

Disabled states:

- `composerActionsDisabled`: disabled prop or `connectionStatus !== "connected"`
- `submitActionDisabled`: composer disabled or no text
- `queueActionDisabled`: composer disabled or no text
### Draft Persistence

- Reads from `chatInputStore.getDraft(chatId)` on mount/chat-switch.
- Writes on every keystroke via `setDraft(chatId, value)`.
- Clears on successful submit result (`queued` or `sent`).
- Preserved across chat switching; each chat has independent draft.
- Queued draft persistence is UI recovery only. Durable queued execution lives on the server after `chat.queue` succeeds.
### Auto-Resize

Textarea expands to fit content up to 200px max height. It recalculates on window resize and value change.

### Preference Controls

| Control | Scope |
| --- | --- |
| Provider selector | Locked to runtime provider if session already has one |
| Model selector | Filtered by selected provider |
| Reasoning effort | Claude-specific slider |
| Context window | Token budget selector |
| Fast mode toggle | Toggles fast output mode |
| Plan mode toggle | Shift+Tab shortcut |
### Skill Ribbon

When slash commands exist, `SkillRibbon` renders above preference controls with clickable skill chips that insert `/skillName` into the composer.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | chatInputStore (draft text per chat) | c3-102 |
| IN | chatPreferencesStore (provider, model, plan mode) | c3-102 |
| IN | Textarea, Button UI primitives | c3-104 |
| IN | shared types (AgentProvider, ModelOptions, ProviderCatalogEntry) | c3-204 |
| OUT | onSubmit callback with message + model options | c3-110 |
## Container Connection

Part of c3-1 (client). Feature layer rendered at the bottom of ChatPage. Collects user input and model preferences before sending to the agent.
