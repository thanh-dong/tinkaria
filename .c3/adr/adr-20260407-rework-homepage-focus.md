---
id: adr-20260407-rework-homepage-focus
c3-seal: d2c1ffc1bf266996793b5612b3939fe4a7187d72924b3cf5f41ffde4f1bdf6da
title: rework-homepage-focus
type: adr
goal: Rework the `/` homepage to be session-centric instead of stats-centric.
status: proposed
date: "2026-04-07"
---

## Goal

Rework the `/` homepage to be session-centric instead of stats-centric.

**Remove:** StatCard section (project counts), overly verbose copy.
**Keep:** Recent sessions (expanded from 3 → 5), workspace grid, add-project action.
**Enhance:** Compact recent-session rows instead of heavy cards. Quick "New chat" affordance per project. Cleaner greeting.

**Affected:** c3-117 (projects component) — `LocalDev.tsx`, `LocalDev.test.tsx`
**Refs honored:** rule-ui-identity-composition, rule-react-no-effects, rule-rule-strict-typescript
