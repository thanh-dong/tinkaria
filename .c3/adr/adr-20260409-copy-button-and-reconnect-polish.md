---
id: adr-20260409-copy-button-and-reconnect-polish
c3-seal: a955c8f38fb8af5e02580d05eeaa00f4239cac48cbe952743b7f331e6abd5b0d
title: copy-button-and-reconnect-polish
type: adr
goal: 'Polish two UI elements for subtlety and non-intrusion:'
status: accepted
date: "2026-04-09"
---

## Goal

Polish two UI elements for subtlety and non-intrusion:

1. **UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.
**UserMessage copy button (c3-111)**: Remove "Copy" text label, make icon-only, hide by default and reveal on hover (desktop) / touch (mobile), reposition inside bubble to stop overlapping content above.

2. **ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.
**ChatInput reconnecting badge (c3-112)**: Reduce visual weight — remove borders/backgrounds/uppercase from badge, soften composer border color, remove amber/emerald button color takeover.

## Affects

- `c3-111` (messages) — UserMessage.tsx copy button styling
- `c3-112` (chat-input) — ChatInput.tsx reconnecting visual state
## Changes
### UserMessage.tsx

- Button: `absolute -top-3 right-3 h-8 min-w-20` → `absolute top-2 right-2 h-7 w-7` (inside bubble, icon-only)
- Visibility: Always visible → `opacity-0 group-hover/user-message:opacity-100 group-active/user-message:opacity-100`
- Removed `<span>Copy/Copied</span>` text labels
- Copied state forces `!opacity-100` for confirmation feedback
### ChatInput.tsx

- Composer border: `border-amber-400/80 shadow-[...]` → `border-amber-400/30` (no shadow)
- Badge: Heavy pill (border, bg, uppercase tracking) → Minimal inline text (10px, no border/bg)
- Submit/cancel/queue buttons: Removed amber/emerald background takeover; spinner icon preserved
## Decision

Subtlety > prominence for transient UI states. Copy affordance revealed by interaction intent (hover/touch). Reconnecting state communicated through text + spinner, not visual alarm.

## Status

Accepted — tests updated and passing (26/26).
