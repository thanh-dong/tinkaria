---
id: adr-20260413-optimize-chat-input-rerender
c3-seal: e7f801f687c7e0243766a87a48aec899f4db700bfff8656cc049c44f603d2e8f
title: optimize-chat-input-rerender
type: adr
goal: Reduce per-keystroke rerender cost in chat composer textarea by isolating draft updates from unrelated chat/composer subtree work while preserving behavior and UI identity.
status: proposed
date: "2026-04-13"
---

## Goal

Reduce per-keystroke rerender cost in chat composer textarea by isolating draft updates from unrelated chat/composer subtree work while preserving behavior and UI identity.
