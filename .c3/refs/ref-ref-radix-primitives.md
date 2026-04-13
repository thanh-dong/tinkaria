---
id: ref-ref-radix-primitives
c3-seal: ca89fb6e0d12125ec4729ef282748d050e573163ee0844fe8b974ce10f5cf8ed
title: ref-radix-primitives
type: ref
goal: Build accessible, composable UI components without reimplementing complex interaction patterns (focus management, keyboard navigation, screen reader support).
---

## Goal

Build accessible, composable UI components without reimplementing complex interaction patterns (focus management, keyboard navigation, screen reader support).

## Choice

Radix UI primitives (Dialog, Select, ContextMenu, Popover, Tooltip, DropdownMenu) provide the headless behavior layer, wrapped with Tailwind CSS classes for visual styling. Each component is a thin wrapper composing Radix parts with project-specific styles.

## Why

- Accessible by default — WAI-ARIA compliant without manual effort
- Unstyled base means full control over visual design via Tailwind
- Composable API with slot-based parts (Trigger, Content, Item) fits React patterns
- Battle-tested interaction patterns (focus trapping, escape handling, portal rendering)
- Avoids heavyweight component libraries that impose design opinions
