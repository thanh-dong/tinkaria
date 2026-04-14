---
id: c3-112
c3-seal: fdc87918843744f4cc1951c9ba6899ee72f0c170d049c35da724ac739abf2a26
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
| Agent running (canCancel=true) | Enter | Queue message |
| Agent running | Shift+Enter | Insert newline |
| Idle (canCancel=false) | Enter (non-touch) | Submit |
| Idle | Ctrl/Cmd+Enter | Submit |
| Idle (touch device) | Enter | Insert newline |
| Any state | Shift+Enter | Always insert newline |
| Composer empty | Arrow Up | Restore queued text |
| Any | Tab | Focus next chat input |
| Any | Shift+Tab | Toggle plan mode |
| Agent running | Escape | Cancel generation |
### Send States

Three visual states for the submit button:

| State | Visual | Trigger |
| --- | --- | --- |
| idle | Arrow-up icon | Default, connection healthy |
| reconnecting | Spinner animation | WebSocket disconnected |
| reconnected | Checkmark icon (1.2s) | Just reconnected, then auto-resets to idle |
### Queue vs Submit UX

**Submit mode** (agent idle, `canCancel=false`):

- Button: arrow-up icon, sends immediately
Button: arrow-up icon, sends immediately

- No cancel button shown
**Queue mode** (agent running, `canCancel=true`):
No cancel button shown
**Queue mode** (agent running, `canCancel=true`):

- Button: clock icon + "Queue" label, holds message until turn finishes
Button: clock icon + "Queue" label, holds message until turn finishes

- Cancel button shown (square stop icon) to abort current generation
Cancel button shown (square stop icon) to abort current generation

- Queued text block appears above composer: amber dashed border, message preview + "Clear" button
**Disabled states:**
Queued text block appears above composer: amber dashed border, message preview + "Clear" button
**Disabled states:**

- `composerActionsDisabled`: disabled prop OR connectionStatus !== "connected"
`composerActionsDisabled`: disabled prop OR connectionStatus !== "connected"

- `submitActionDisabled`: composerActionsDisabled OR no text
`submitActionDisabled`: composerActionsDisabled OR no text

- `queueActionDisabled`: composerActionsDisabled OR no text
`queueActionDisabled`: composerActionsDisabled OR no text

### Draft Persistence

- Reads from `chatInputStore.getDraft(chatId)` on mount/chat-switch
- Writes on every keystroke via `setDraft(chatId, value)`
- Clears on successful submit (both "queued" and "sent" results)
- Preserved across chat switching — each chat has independent draft
### Auto-Resize

Textarea expands to fit content up to 200px max height. Recalculates on window resize and value change.

### Preference Controls

Rendered below textarea via `ComposerPreferenceControls`:

| Control | Scope |
| --- | --- |
| Provider selector | Locked to runtime provider if session already has one |
| Model selector | Filtered by selected provider |
| Reasoning effort | Claude-specific slider |
| Context window | Token budget selector |
| Fast mode toggle | Toggles fast output mode |
| Plan mode toggle | Shift+Tab shortcut |
### Skill Ribbon

When available slash commands exist (`availableSkills`), a `SkillRibbon` renders above the preference controls showing clickable skill chips that insert `/skillName` into the composer.

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
