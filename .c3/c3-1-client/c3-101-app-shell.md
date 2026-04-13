---
id: c3-101
c3-seal: 0e9249e5cd948d94e8aa6e9440ad8003050afd98361a882066a6fe9815f57dbd
title: app-shell
type: component
category: foundation
parent: c3-1
goal: Bootstrap the React 19 SPA shell, route `/` and `/chat/:chatId`, provide shared app-level context, and host the Alt+Shift identity overlay controller that exposes semantic ownership tags across the client.
uses:
    - c3-108
    - ref-component-identity-mapping
    - ref-mobile-tabbed-page-pattern
    - ref-pwa
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-identity-composition
---

## Goal

Bootstrap the React 19 SPA shell, route `/` and `/chat/:chatId`, provide shared app-level context, and host the Alt+Shift identity overlay controller that exposes semantic ownership tags across the client.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | ThemeProvider context | c3-103 |
| IN | TooltipProvider and AppDialogProvider primitives | c3-104 |
| IN | TinkariaSidebar global navigation shell | c3-113 |
| IN | Local projects route surface at / | c3-117 |
| IN | Chat route surface at /chat/:chatId | c3-110 |
| IN | Ui identity helpers and Alt+Shift overlay controller | c3-108 |
| OUT | Outlet context (TinkariaState) for routed screens | c3-110 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-zustand-stores | Layout state consumed from stores |
| ref-pwa |  |
| c3-108 |  |
| ref-component-identity-mapping |  |
| ref-mobile-tabbed-page-pattern |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-react-no-effects |  |
| rule-ui-identity-composition |  |
## Container Connection

Part of c3-1 (client). This is the browser entry shell: it owns routing, persistent sidebar chrome, and the global Alt+Shift identity overlay so every screen-level surface can be discovered from one place.
