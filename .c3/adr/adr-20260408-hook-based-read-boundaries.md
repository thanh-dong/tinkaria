---
id: adr-20260408-hook-based-read-boundaries
c3-seal: b2386c348f124fa9b870e52448d1342fb5c290ba9c7771fbbbe2ff100d0891ba
title: hook-based-read-boundaries
type: adr
goal: Use transcript block hooks as semantic read boundaries and keep the live transcript pinned while the current turn streams, so the scroll-down affordance only appears when the user has actually detached from the active read/follow edge. Prefer screen-height/percentage thresholds over fixed pixel constants, allow multiple hook boundaries per message, and remove redundant tail-sentinel heuristics where the hook model fully supersedes them.
status: implemented
date: "2026-04-08"
---

# hook-based-read-boundaries
## Goal

Use transcript block hooks as semantic read boundaries and keep the live transcript pinned while the current turn streams, so the scroll-down affordance only appears when the user has actually detached from the active read/follow edge. Prefer screen-height/percentage thresholds over fixed pixel constants, allow multiple hook boundaries per message, and remove redundant tail-sentinel heuristics where the hook model fully supersedes them.
