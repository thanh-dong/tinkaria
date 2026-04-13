---
id: ref-responsive-modal-pattern
c3-seal: c8ef5aae31798bd0ba0f059cafe319acad283aee35141ec1a1f1702e260c7f1a
title: responsive-modal-pattern
type: ref
goal: Keep modal-style surfaces usable and visually consistent across desktop and mobile so Tinkaria dialogs do not degrade into clipped or hard-to-dismiss overlays on phones.
---

## Goal

Keep modal-style surfaces usable and visually consistent across desktop and mobile so Tinkaria dialogs do not degrade into clipped or hard-to-dismiss overlays on phones.

## Choice

Applicable modal surfaces use the shared dialog responsive modal tokens from `src/client/components/ui/dialog.tsx`: fullscreen-style content bounds on mobile, safe-area-aware header spacing when needed, and safe-area-aware footer spacing for action rows.

## Why

Tinkaria has multiple modal surfaces owned by different components. Without a shared rule, mobile behavior drifts into a mix of centered desktop dialogs, ad hoc fullscreen overrides, and inconsistent action spacing. A single responsive modal pattern keeps touch ergonomics, dismissal affordances, and visual rhythm aligned.

## How

For modal-style surfaces that remain dialogs on desktop but need mobile adaptation, reuse `RESPONSIVE_MODAL_CONTENT_CLASS_NAME` and `RESPONSIVE_MODAL_FOOTER_CLASS_NAME` from the dialog primitives instead of retyping fullscreen mobile classes. Use `RESPONSIVE_MODAL_HEADER_CLASS_NAME` when the header needs safe-area top breathing room. Apply this pattern to chat/session dialogs, project creation dialogs, app-level confirm/prompt dialogs, and any future fullscreen-capable modal surfaces unless a component has a documented stronger requirement.
