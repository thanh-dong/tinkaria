---
id: adr-20260414-ref-rule-enforcement-pass
c3-seal: 307cf6f47a0498e60f5f8ffd036bbd67de74f4a52d8648269ac34b0c7fe7b579
title: ref-rule-enforcement-pass
type: adr
goal: Review all active refs and rules, enhance weak/stale details, and make enforcement hooks concrete enough for future code changes to inherit the right constraints.
status: proposed
date: "2026-04-14"
---

## Goal

Review all active refs and rules, enhance weak/stale details, and make enforcement hooks concrete enough for future code changes to inherit the right constraints.

## Context

The transcript re-onboard split exposed useful C3 structure, but the wider ref/rule set may still contain stale branding, vague roles, duplicated guidance, missing golden examples, or weak code-map coverage. This pass audits those refs/rules through the C3 CLI only and patches concrete drift.

## Plan

1. Inventory all refs/rules and classify gaps: stale branding, empty or vague enforcement, missing How/Golden Example/Not This, stale codemap, or unsearchable wording.
2. Patch only concrete gaps that improve future lookup/enforcement.
3. Keep historical ADR text and real legacy constants intact.
4. Verify with `c3x check`, `c3x verify`, focused queries, and lookup samples.
