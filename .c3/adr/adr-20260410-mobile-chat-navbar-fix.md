---
id: adr-20260410-mobile-chat-navbar-fix
c3-seal: 931a8f917f6f601e319381c66745439dfdb67c4a4f5b1b6263f6c39ecdaf80e8
title: mobile-chat-navbar-fix
type: adr
goal: 'Fix mobile ChatNavbar UX issues:'
status: accepted
date: "2026-04-10"
---

## Goal

Fix mobile ChatNavbar UX issues:

1. **Hamburger → expand toggle**: On mobile, the hamburger icon (now `MoreHorizontal`) toggles the left pill to reveal fork/merge/sidebar actions. Previously it directly opened the sidebar, which was confusing.
2. **Title readability**: Session title now has a rounded background pill on mobile (`max-md:bg-background/80 + backdrop-blur`) so it's visible against scroll content.
### Changes

- `ChatNavbar.tsx`: Added `mobileExpanded` state. Mobile toggle shows `MoreHorizontal`/`X` icons. Fork/merge buttons conditionally visible via `mobileExpanded`. Dedicated sidebar toggle (`PanelLeft`) appears when expanded.
- Title `div` gets `max-md:*` classes for background, border, blur, shadow.
- `Menu` icon removed from imports (no longer used).
### Decision

Keep sidebar accessible via dedicated icon in expanded state + existing swipe gesture. The hamburger icon is replaced with `MoreHorizontal` (⋯) to signal "more actions" rather than "navigation menu".
