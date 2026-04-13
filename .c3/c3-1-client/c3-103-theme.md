---
id: c3-103
c3-seal: bc856d6f9bab333e3d4cd809462269a39f71a356d0195cb5b0457e799f8bfb54
title: theme
type: component
category: foundation
parent: c3-1
goal: Provide a React context for dark/light/system theme preference — persist choice to localStorage, resolve system preference via matchMedia, and toggle the `dark` class on `<html>` for Tailwind dark mode.
uses:
    - ref-component-identity-mapping
    - ref-ref-tailwind-theming
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

## Goal

Provide a React context for dark/light/system theme preference — persist choice to localStorage, resolve system preference via matchMedia, and toggle the `dark` class on `<html>` for Tailwind dark mode.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| OUT | ThemeProvider wrapping the app tree | c3-101 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-tailwind-theming | dark: variant driven by dark class on documentElement |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-react-no-effects |  |
## Container Connection

Part of c3-1 (client). Foundation layer — wraps entire app in main.tsx, consumed by settings UI and all themed components.
