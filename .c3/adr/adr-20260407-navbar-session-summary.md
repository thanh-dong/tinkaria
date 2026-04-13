---
id: adr-20260407-navbar-session-summary
c3-seal: 8a46df971ca72ff5481fa6644831f274d0e6718444be34a682e432d98f462025
title: navbar-session-summary
type: adr
goal: Show session summary (title + status) in ChatNavbar when the sidebar is collapsed, so users always know which session they're in regardless of sidebar state.
status: proposed
date: "2026-04-07"
---

## Goal

Show session summary (title + status) in ChatNavbar when the sidebar is collapsed, so users always know which session they're in regardless of sidebar state.

## Decision

Add `chatTitle` and `chatStatus` props to `ChatNavbar`. When `sidebarCollapsed` is true, render a truncated session title in the center of the navbar (between left and right pills). A subtle status dot shows the session state (idle/running/waiting). When sidebar is expanded, the title hides to avoid redundancy with sidebar chat rows.

## Affected Files

- `src/client/components/chat-ui/ChatNavbar.tsx` — add title + status rendering
- `src/client/components/chat-ui/ChatNavbar.test.tsx` — test new props
- `src/client/app/ChatPage.tsx` — pass chatTitle/chatStatus from state
