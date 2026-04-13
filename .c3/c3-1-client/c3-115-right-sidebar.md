---
id: c3-115
c3-seal: b10dfd17fde14c180c8e21f589491fdfde023bfe368caa828bfa96a82bd07408
title: right-sidebar
type: component
category: feature
parent: c3-1
goal: Right panel for file explorer and diffs — togglable side panel with animated open/close, persisted width per project, currently showing a placeholder for upcoming diff view.
uses:
    - ref-component-identity-mapping
    - ref-ref-zustand-stores
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

## Goal

Right panel for file explorer and diffs — togglable side panel with animated open/close, persisted width per project, currently showing a placeholder for upcoming diff view.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | rightSidebarStore (open state, panel sizes per project) | c3-102 |
| IN | ResizablePanel UI primitive | c3-104 |
| OUT | Right panel content area to ChatPage layout | c3-110 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-zustand-stores | Per-project sidebar state persistence |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-react-no-effects |  |
## Container Connection

Part of c3-1 (client). Feature layer — renders in a resizable right panel of ChatPage. Currently a placeholder for the upcoming diff/file explorer feature.
