---
id: adr-20260414-preserve-live-answer-after-tools
c3-seal: 0dfb39f0d4b8f32f951232d0d22a79404e07a8a5df8ca3fd3ade2b11a8f31f13
title: preserve-live-answer-after-tools
type: adr
goal: Prevent a real trailing assistant answer from being swallowed into `message.wip-block.area` during a live turn while preserving the existing anti-flash behavior for transient narration.
status: proposed
date: "2026-04-14"
---

## Goal

Prevent a real trailing assistant answer from being swallowed into `message.wip-block.area` during a live turn while preserving the existing anti-flash behavior for transient narration.

## Scope

- `src/client/app/ChatTranscript.tsx`
- `src/client/app/ChatTranscript.test.tsx`
## Affects

- c3-111
## Why

Current live-turn grouping suppresses the trailing assistant text whenever earlier assistant text or tool activity exists. That keeps transient narration from flashing as a final answer, but it also hides real answers until the turn fully settles.
