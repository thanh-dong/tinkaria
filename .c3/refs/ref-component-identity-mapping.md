---
id: ref-component-identity-mapping
c3-seal: d94e3a01ab10f1e23480b1517f3476788fdfe315d79f5023620eba8b0a36e47b
title: component-identity-mapping
type: ref
goal: Document stable semantic UI identifiers for all C3 components so Alt+Shift inspection, browser automation, and UI-to-architecture tracing all resolve to the same semantic ownership model.
uses:
    - rule-ui-identity-composition
---

## Goal

Document stable semantic UI identifiers for all C3 components so Alt+Shift inspection, browser automation, and UI-to-architecture tracing all resolve to the same semantic ownership model.

## Choice

Every user-visible grab target and screen composition surface uses a stable `data-ui-id` plus explicit `data-ui-c3` ownership metadata derived from C3-backed descriptors instead of ad hoc ids.

## Why

The overlay, browser automation, and regression tests only stay reliable if semantic ids are stable and architecture-owned. Centralizing the mapping in C3 prevents drift between component ownership, UI ids, and test selectors.

## How

When a client surface becomes intentionally inspectable or automatable, define its descriptor from the owning C3 component, expose the `data-ui-id` and `data-ui-c3` attributes through shared helpers, and keep the ids semantic rather than presentational. New screen-level surfaces should also follow `rule-ui-identity-composition` so the route-to-component mapping remains auditable.
