---
id: adr-20260409-external-source-defensive-boundaries
c3-seal: 780f678891a41d06c8f466a1bd4fdd864646c1ba4dc6d46bd900426a3efc708c
title: external-source-defensive-boundaries
type: adr
goal: Adopt an explicit architecture rule that external-source identifiers are advisory until revalidated. This change documents the boundary between Tinkaria's persisted state and foreign systems such as Claude session history, so stale external references are handled as an expected branch with preserved evidence instead of being treated as trustworthy local truth.
status: implemented
date: "2026-04-09"
affects:
    - c3-205
    - c3-210
    - c3-217
    - ref-external-source-authority-boundaries
    - rule-external-source-stale-handle-guards
---

## Goal

Adopt an explicit architecture rule that external-source identifiers are advisory until revalidated. This change documents the boundary between Tinkaria's persisted state and foreign systems such as Claude session history, so stale external references are handled as an expected branch with preserved evidence instead of being treated as trustworthy local truth.
