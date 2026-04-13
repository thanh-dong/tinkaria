---
id: c3-104
c3-seal: af6f392c375cbb381ee79dab3fe27aaa24b636bee4ee3996565ad1674d805d4c
title: ui-primitives
type: component
category: foundation
parent: c3-1
goal: Expose a library of Radix-based headless UI primitives (Button, Card, Dialog, Popover, ScrollArea, Textarea, Input, Select, Tooltip, Kbd, ContextMenu, Resizable, AppDialog, AnimatedShinyText, SegmentedControl, SettingsHeaderButton) styled with Tailwind and class-variance-authority.
uses:
    - ref-component-identity-mapping
    - ref-mobile-tabbed-page-pattern
    - ref-ref-radix-primitives
    - ref-ref-tailwind-theming
    - ref-responsive-modal-pattern
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

## Goal

Expose a library of Radix-based headless UI primitives (Button, Card, Dialog, Popover, ScrollArea, Textarea, Input, Select, Tooltip, Kbd, ContextMenu, Resizable, AppDialog, AnimatedShinyText, SegmentedControl, SettingsHeaderButton) styled with Tailwind and class-variance-authority.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | CSS variables from theme | c3-103 |
| OUT | UI components to all feature components | c3-110 |
| OUT | TooltipProvider, AppDialogProvider to app shell | c3-101 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-radix-primitives | Headless accessible UI primitives (tooltip, dialog, popover, scroll-area, context-menu, select) |
| ref-ref-tailwind-theming | Tailwind class-based styling with dark mode support |
| ref-component-identity-mapping |  |
| ref-responsive-modal-pattern |  |
| ref-mobile-tabbed-page-pattern |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-react-no-effects |  |
## Container Connection

Part of c3-1 (client). Foundation layer — every feature component imports from this library. No business logic lives here.
