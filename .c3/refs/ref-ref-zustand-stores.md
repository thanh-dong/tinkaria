---
id: ref-ref-zustand-stores
c3-seal: fd08861a7d5121b6e158ef57ca462f57704fc4fe9038bb7ea816a1c241c74380
title: zustand-stores
type: ref
goal: 'Document the Zustand store persistence pattern for Tinkaria: small domain stores, localStorage normalization, fine-grained selectors, and boundaries from server-derived state.'
---

## Goal

Document the Zustand store persistence pattern for Tinkaria: small domain stores, localStorage normalization, fine-grained selectors, and boundaries from server-derived state.

## Choice

Multiple small Zustand stores, each owning a specific domain: chatPreferences, chatInput, rightSidebar, terminalLayout, terminalPreferences, projectGroupOrder. Each store is independently created with `create()` and uses `persist` middleware for durable state.

## Why

- Simple API — no providers, reducers, or action creators
- Zero boilerplate compared to Redux or Context-based patterns
- Fine-grained subscriptions prevent unnecessary re-renders
- localStorage persistence middleware handles serialization automatically
- Small stores are easy to reason about and test in isolation
## How

Use small domain stores for browser UI state that outlives one component or coordinates multiple components.

Implementation contract:

- Store modules own state shape, actions, persistence keys, and normalization of persisted values.
- Components select only the slices they need; avoid reading whole stores in high-churn render paths.
- Draft state with per-chat identity belongs in keyed store maps or local component state, not effect-driven prop mirrors.
- Persisted store changes require migration/default tests so stale localStorage cannot crash startup.
- Server-derived state stays in subscription/read-model hooks; Zustand should not duplicate authoritative server snapshots.
