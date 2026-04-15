---
id: adr-20260415-fix-subagent-transcript-scroll
c3-seal: 2ec84963d5ce492b880f678d65784af72b1cae716db79f0da96dcd4a0f3eed17
title: fix-subagent-transcript-scroll
type: adr
goal: Fix `chat.composer.subagents.transcript` / `c3:c3-112(chat-input)` inspector transcript layout so content scrolls instead of clipping and spacing remains readable.
status: proposed
date: "2026-04-15"
---

## Goal

Fix `chat.composer.subagents.transcript` / `c3:c3-112(chat-input)` inspector transcript layout so content scrolls instead of clipping and spacing remains readable.

## Context

User reports subagent transcript content is not scrollable and looks cut off. Existing todo notes prior trace to `SubagentIndicator` inspector shell missing bounded flex height / `min-h-0` chain.

## Decision

Use RED-GREEN-TDD. Add or confirm focused regression coverage for bounded scroll behavior, then apply minimal layout fix around the subagent transcript inspector shell. Verify with focused tests, native typecheck, C3 check, and browser smoke.

## Consequences

Transcript modal should keep header/composer chrome stable while transcript body scrolls internally. Scope stays in chat input/subagent inspector UI unless tests reveal shared transcript regression.
