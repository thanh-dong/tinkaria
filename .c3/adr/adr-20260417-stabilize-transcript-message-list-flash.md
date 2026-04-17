---
id: adr-20260417-stabilize-transcript-message-list-flash
c3-seal: 31b3d46c8cb12491a6b152988c799acfcb7b219bd2e72c127e7e628396432579
title: stabilize-transcript-message-list-flash
type: adr
goal: 'Eliminate transcript message-list blinking/flashing during live turns by fixing four compounding root causes: isLoading-dependent unit restructuring (RC1), index-based virtualizer keys (RC2), animation replay on remount (RC3), and non-atomic snapshot state updates (RC4). Implement phase-stability invariant from ref-transcript-render-state-machine.'
status: proposed
date: "2026-04-17"
---

## Goal

Eliminate transcript message-list blinking/flashing during live turns by fixing four compounding root causes: isLoading-dependent unit restructuring (RC1), index-based virtualizer keys (RC2), animation replay on remount (RC3), and non-atomic snapshot state updates (RC4). Implement phase-stability invariant from ref-transcript-render-state-machine.

## Status

proposed

## Context

Root cause analysis reveals the flash is a cascade: foldTranscriptRenderUnits uses isLoading to conditionally create wip_block vs separate units (transcript-render.ts:406), virtualizer has no getItemKey override, animate-narration-guard replays on each remount, and sequential setState compounds re-renders.

## Decision

Make projection phase-stable (same entries = same unit kind/id regardless of isLoading), add getItemKey to virtualizer, gate animation on already-visible content, batch snapshot state updates.

## Affects

c3-111, c3-119, c3-118, ref-live-transcript-render-contract, ref-transcript-render-state-machine

## Consequences

Unit structure becomes deterministic from entry content alone. isLoading only affects visual adornment. Virtualizer recycles DOM correctly. Animation plays once per unit mount.
