---
id: adr-20260414-enforce-present-content-boundary
c3-seal: c9c0317e37acd6267ca9dba6c9b29c9e60903771f016f9983d7849189c8fcbbd
title: enforce-present-content-boundary
type: adr
goal: Keep `present_content` artifacts outside WIP grouping and finish C3 render-flow enforcement after re-onboard discovery found a docs/code mismatch.
status: proposed
date: "2026-04-14"
---

## Goal

Keep `present_content` artifacts outside WIP grouping and finish C3 render-flow enforcement after re-onboard discovery found a docs/code mismatch.

## Context

Re-onboard added `ref-live-transcript-render-contract`, `recipe-agent-turn-render-flow`, and `rule-transcript-boundary-regressions`. Sidecar review found `present_content` is documented as a dedicated artifact renderer but `ChatTranscript.groupMessages` can still treat it as a collapsible tool inside WIP because only `AskUserQuestion`, `ExitPlanMode`, and `TodoWrite` are special.

## Plan

1. Add failing coverage for `assistant_text -> present_content -> assistant_text` preserving WIP, artifact, and answer as distinct render items.
2. Update grouping/special-tool classification so `present_content` stays visible as its dedicated renderer.
3. Finish C3 codemap/doc fixes for `ChatTranscript`, `useTranscriptLifecycle`, server transcript consumer, runner transcript flow, and stale `TinkariaTranscript` references.
4. Verify focused tests, native typecheck, and `c3x check` plus lookup/query evidence.
