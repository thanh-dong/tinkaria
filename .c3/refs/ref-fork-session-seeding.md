---
id: ref-fork-session-seeding
c3-seal: 41ccb3ce4bc2bc0c149276c72552759fa1ff4f98584c1ee061e731768df0b42f
title: fork-session-seeding
type: ref
goal: Seed forked chats with the minimum high-value context needed to continue work independently.
---

## Goal

Seed forked chats with the minimum high-value context needed to continue work independently.

## Choice

Fork session creation uses a server-side derived prompt builder fed by the source chat transcript, the user's editable fork intent, and an optional preset lens. The textarea is intent input to the builder, not the literal first prompt sent unchanged.

## Why

Forking is separate from delegation. A forked chat should begin as a clean independent session, but still inherit essential context, constraints, and next-step framing from the source chat. Server-side derivation keeps transcript access and compaction close to persisted chat state, while presets speed up common fork patterns without locking the user into fixed workflows.

## How

1. The fork dialog lets the user choose a preset scaffold and edit the resulting intent text.
2. The client calls `chat.generateForkPrompt` with the active `chatId`, edited `intent`, and optional `preset` id.
3. The server builds a bounded transcript excerpt, injects preset guidance, and generates a concise fork seed prompt.
4. The client creates a new chat and sends that generated prompt as the first message.
5. The new session runs independently; no parent-child wait/send loop is part of the fork UX.
