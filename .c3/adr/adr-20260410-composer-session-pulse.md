---
id: adr-20260410-composer-session-pulse
c3-seal: f461fdf334bf0449e8a7d7f3fca14b1a16ccb7c19398bb71237157ca801a7423
title: composer-session-pulse
type: adr
goal: 'Move session-state indication from transcript messages into the composer border:'
status: proposed
date: "2026-04-10"
---

## Goal

Move session-state indication from transcript messages into the composer border:

1. **Running**: gentle pulse animation on composer border when `canCancel` is true (session actively running)
2. **Reconnecting**: keep current amber border visual, remove the text badge inside composer
3. **Remove transcript status messages**: no more "Reconnecting" or "Disconnecting" text injected into the message list
Affected: c3-112 (chat-input), c3-111 (messages)
## Approach

- Add CSS `@keyframes` for a subtle border pulse using brand coral accent
- Derive a `isRunning` state from `canCancel` prop in ChatInput
- Apply pulse class to the composer container when running
- Remove the connection badge text (keep border color transitions for reconnecting)
- Find and remove any reconnecting/disconnecting messages from transcript rendering
