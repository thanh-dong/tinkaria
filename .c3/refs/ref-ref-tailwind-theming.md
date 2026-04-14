---
id: ref-ref-tailwind-theming
c3-seal: 4cd656f924829a91efe0c7e2f01306992c00304db210d65063e6a8145fc38aae
title: tailwind-theming
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
## How

Theme through CSS variables and semantic Tailwind utilities, not hard-coded palette values in feature code.

Implementation contract:

- Shared tokens live in global CSS/theme layers; components consume semantic tokens such as `bg-background`, `text-muted-foreground`, `border-border`, and project CSS variables.
- Dark/light behavior must come from root theme class and CSS variable cascade, not runtime style mutation.
- New repeated visual tokens belong in the shared theme layer before feature-specific use spreads.
- UI changes should be checked in both light and dark modes when colors, contrast, or surfaces change.
