---
id: c3-211
c3-seal: 5f2c70aa5746d491d09616b1c6499054405166baf040e130fe9b634bafb87beb
title: providers
type: component
category: feature
parent: c3-2
goal: Provider and model catalog abstraction — normalizes Claude and Codex model options (reasoning effort, context window, fast mode) and exposes a unified provider registry.
uses:
    - ref-component-identity-mapping
    - ref-ref-provider-abstraction
    - rule-bun-test-conventions
    - rule-prefixed-logging
    - rule-rule-bun-runtime
    - rule-rule-strict-typescript
    - rule-type-guards
---

## Goal

Provider and model catalog abstraction — normalizes Claude and Codex model options (reasoning effort, context window, fast mode) and exposes a unified provider registry.

## Dependencies

- c3-204 (shared-types) — AgentProvider, ClaudeModelOptions, CodexModelOptions, PROVIDERS, reasoning effort validators
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-provider-abstraction | Unified provider registry and model option normalization |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-bun-runtime | Server code uses Bun APIs exclusively |
| rule-rule-strict-typescript | Strict typing enforced across all source files |
| rule-bun-test-conventions |  |
| rule-type-guards |  |
| rule-prefixed-logging |  |
## Container Connection

Part of c3-2 (server). Provides the model selection and normalization layer consumed by the agent coordinator (c3-210) when starting turns.
