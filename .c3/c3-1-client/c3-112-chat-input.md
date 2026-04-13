---
id: c3-112
c3-seal: 7a2f45d2eb974a1d31dcea66604d6313494046744bbc805ceda2d63a3d9a251e
title: chat-input
type: component
category: feature
parent: c3-1
goal: Multi-line chat input with auto-resize, submit on Enter, cancel/queue behavior, and a preference bar for provider/model/context-window/reasoning-effort selection and plan-mode toggle.
uses:
    - ref-component-identity-mapping
    - ref-ref-provider-abstraction
    - ref-ref-radix-primitives
    - ref-ref-zustand-stores
    - rule-bun-test-conventions
    - rule-error-extraction
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

## Goal

Multi-line chat input with auto-resize, submit on Enter, cancel/queue behavior, and a preference bar for provider/model/context-window/reasoning-effort selection and plan-mode toggle.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | chatInputStore (draft text per chat) | c3-102 |
| IN | chatPreferencesStore (provider, model, plan mode) | c3-102 |
| IN | Textarea, Button UI primitives | c3-104 |
| IN | shared types (AgentProvider, ModelOptions, ProviderCatalogEntry) | c3-204 |
| OUT | onSubmit callback with message + model options | c3-110 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-zustand-stores | Per-chat draft and preference state |
| ref-ref-radix-primitives | Select dropdowns, tooltip, and navbar button primitives |
| ref-ref-provider-abstraction | Provider/model catalog for preference selection |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-react-no-effects |  |
| rule-error-extraction |  |
## Container Connection

Part of c3-1 (client). Feature layer rendered at the bottom of ChatPage. Collects user input and model preferences before sending to the agent.
