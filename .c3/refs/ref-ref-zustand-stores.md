---
id: ref-ref-zustand-stores
c3-seal: 741a69d17c5d9a68f49a2455897216f65f5d85d7bef254bf114877a5ab6d2cd9
title: ref-zustand-stores
type: ref
goal: Manage client-side UI state with minimal boilerplate, fine-grained reactivity, and localStorage persistence where needed.
---

## Goal

Manage client-side UI state with minimal boilerplate, fine-grained reactivity, and localStorage persistence where needed.

## Choice

Multiple small Zustand stores, each owning a specific domain: chatPreferences, chatInput, rightSidebar, terminalLayout, terminalPreferences, projectGroupOrder. Each store is independently created with `create()` and uses `persist` middleware for durable state.

## Why

- Simple API — no providers, reducers, or action creators
- Zero boilerplate compared to Redux or Context-based patterns
- Fine-grained subscriptions prevent unnecessary re-renders
- localStorage persistence middleware handles serialization automatically
- Small stores are easy to reason about and test in isolation
