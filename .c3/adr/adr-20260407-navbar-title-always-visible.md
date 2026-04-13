---
id: adr-20260407-navbar-title-always-visible
c3-seal: 0cca516885d7556e895007301cc9541d4dd1f802473dbc952ee5e3703e07f5f5
title: navbar-title-always-visible
type: adr
goal: Show the session title in the chat navbar at all times when a chatTitle exists, not only when the sidebar is collapsed. On mobile (max-md), constrain the title width to 120px when the sidebar is expanded to keep the navbar compact.
status: accepted
date: "2026-04-07"
---

## Goal

Show the session title in the chat navbar at all times when a chatTitle exists, not only when the sidebar is collapsed. On mobile (max-md), constrain the title width to 120px when the sidebar is expanded to keep the navbar compact.

Changes:

- ChatNavbar.tsx: Removed sidebarCollapsed guard from title render condition. Added max-md:max-w-[120px] class when sidebar is expanded.
- ChatNavbar.test.tsx: Updated test expectations for always-visible title. Added mobile compact class test.
