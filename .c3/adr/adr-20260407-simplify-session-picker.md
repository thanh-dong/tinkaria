---
id: adr-20260407-simplify-session-picker
c3-seal: 1f1d7168d4f39d55ed1fc3de618092bbf7256e9fd7cba0c97e7907f25ee130cc
title: simplify-session-picker
type: adr
goal: Simplify the SessionPicker popover in the sidebar project-group header. Strip it down to only show sessions NOT already visible as sidebar chats, with proper names only, and let the user pick.
status: proposed
date: "2026-04-07"
---

## Goal

Simplify the SessionPicker popover in the sidebar project-group header. Strip it down to only show sessions NOT already visible as sidebar chats, with proper names only, and let the user pick.

### Changes

1. Filter out sessions whose chatId matches a sidebar chat
2. Filter out noisy sessions lacking both title and lastExchange.question
3. Remove RuntimeBadges, simplify to clean list (name + relative time + provider badge)
4. Keep search and refresh
