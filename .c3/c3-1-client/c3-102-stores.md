---
id: c3-102
c3-seal: 24c0557674f4f8c1c652149c0be2e327668df82c1251d74910e20aa9e0ee98e5
title: stores
type: component
category: foundation
parent: c3-1
goal: Provide lightweight Zustand stores for all client-side UI preferences and layout state — chat input drafts, model/provider preferences, terminal layout splits, sidebar visibility, and project group ordering.
uses:
    - ref-component-identity-mapping
    - ref-ref-zustand-stores
    - rule-bun-test-conventions
    - rule-rule-strict-typescript
---

## Goal

Provide lightweight Zustand stores for all client-side UI preferences and layout state — chat input drafts, model/provider preferences, terminal layout splits, sidebar visibility, and project group ordering.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | shared types (AgentProvider, ModelOptions) | c3-204 |
| OUT | chatInputStore (draft text per chat) | c3-112 |
| OUT | chatPreferencesStore (provider, model, plan mode) | c3-112 |
| OUT | rightSidebarStore (open state, panel sizes) | c3-115 |
| OUT | projectGroupOrderStore (sidebar group order) | c3-113 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-zustand-stores | State management library — each store is a standalone hook with localStorage persistence |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
## Container Connection

Part of c3-1 (client). Foundation layer — feature components consume these stores for UI state without prop-drilling.
