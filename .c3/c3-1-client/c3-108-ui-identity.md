---
id: c3-108
c3-seal: 3e9fcb1abc0b207fc78a336f5be3e8f1ffa36e19b4db2d99964cd6efc41cf549
title: ui-identity
type: component
category: foundation
parent: c3-1
goal: Own semantic UI identity helpers plus the Alt+Shift overlay controller so interactive client surfaces expose stable `data-ui-id` hooks that map back to C3 screen/component ownership.
uses:
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-ui-identity-composition
---

## Goal

Own semantic UI identity helpers plus the Alt+Shift overlay controller so interactive client surfaces expose stable `data-ui-id` hooks that map back to C3 screen/component ownership.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Pointer and keyboard events from the outer app shell | c3-101 |
| IN | Semantic ui-id tags emitted by chat, sidebar, and home screen surfaces | c3-110 |
| IN | Semantic ui-id tags emitted by project discovery and homepage surfaces | c3-117 |
| IN | Semantic ui-id tags emitted by sidebar rows, project groups, and session picker surfaces | c3-113 |
| OUT | Alt+Shift overlay stack, copyable ui ids, and shared identity helpers | c3-1 |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Keep identity helpers and overlay behavior regression-tested. |
| rule-react-no-effects | Keep the overlay controller constrained to external event synchronization rather than view-derived effects. |
| rule-rule-strict-typescript | Preserve stable typed identity maps and helper contracts. |
| rule-ui-identity-composition |  |
## Container Connection

Part of c3-1 (client). This is the client-side identity spine: shared helpers mint semantic `data-ui-id` values, the app-shell listens for Alt+Shift, and the overlay reveals the nearest tagged ownership path so screen discovery can jump straight into C3.
