---
id: ref-ref-tailwind-theming
c3-seal: ecb6792d2a727f26aaf934abc9e48eae17bfa4e876c2e8a61c7bcdacba696a23
title: ref-tailwind-theming
type: ref
goal: Support light and dark themes with consistent design tokens that can switch at runtime without requiring a rebuild or page reload.
---

## Goal

Support light and dark themes with consistent design tokens that can switch at runtime without requiring a rebuild or page reload.

## Choice

CSS custom properties (--color-*) define the color palette, consumed by Tailwind CSS 4 utility classes. Dark mode toggles via a class on the root element, swapping the custom property values.

## Why

- Runtime theme switching without rebuild — just toggle a CSS class
- Consistent design tokens across all components via shared custom properties
- Tailwind CSS 4 native @theme directive integrates cleanly with CSS variables
- Easy to extend with additional themes beyond light/dark
- No JavaScript runtime cost for theming — pure CSS cascade
