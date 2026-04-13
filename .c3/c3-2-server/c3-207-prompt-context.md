---
id: c3-207
c3-seal: f41e680d7993065c906496196904b4e150a1218fd4fbc735bdb1fb459f9f9ec8
title: prompt-context
type: component
category: foundation
parent: c3-2
goal: Compose the additive web-context instructions sent to Claude and Codex, including browser UI awareness, cross-session orchestration constraints, rich-content guidance, direct-embed preferences, and Codex present_content usage hints.
uses:
    - c3-106
    - c3-107
    - c3-206
    - ref-component-identity-mapping
    - ref-ref-provider-abstraction
    - rule-bun-test-conventions
    - rule-rule-strict-typescript
---

## Goal

Compose the additive web-context instructions sent to Claude and Codex, including browser UI awareness, cross-session orchestration constraints, rich-content guidance, direct-embed preferences, and Codex present_content usage hints.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | App branding and provider names used in prompt copy | c3-204 |
| IN | Cross-session delegation semantics that the prompt must describe accurately | c3-206 |
| IN | Rich transcript affordances, remote embed capabilities, and overlay behavior exposed in the client | c3-107 |
| IN | Dedicated present_content artifact behavior and examples, including direct embeds | c3-106 |
| OUT | Claude system prompt append text | c3-210 |
| OUT | Codex developer_instructions payload | c3-216 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-ref-provider-abstraction | Keeps prompt guidance aligned across providers while allowing provider-specific additions |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Prompt guidance is covered by focused tests so wording drift is caught |
| rule-rule-strict-typescript | Shared prompt builder stays type-safe across provider paths |
## Container Connection

Part of c3-2 (server). This is the prompt composition layer shared by provider runtimes: it documents what the browser product can render, when direct embeds are preferable to plain links, and what orchestration semantics the model must assume before a turn starts.
