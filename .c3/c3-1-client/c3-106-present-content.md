---
id: c3-106
c3-seal: 27b0cce1d1a33e21f8e99e7abbfb8dd30730c87dd7791ace836ea5602ab10df4
title: present-content
type: component
category: feature
parent: c3-1
goal: Dedicated present_content transcript feature that normalizes typed content artifacts, including direct embeds, and renders them as rich cards instead of generic tool text.
uses:
    - c3-107
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - ref-mcp-app-hosting
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Dedicated present_content transcript feature that normalizes typed content artifacts, including direct embeds, and renders them as rich cards instead of generic tool text.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Dynamic tool calls and tool results emitted by the Codex runtime | c3-216 |
| IN | Shared tool normalization and typed transcript payloads | c3-204 |
| IN | Rich overlay, embed/code/markdown rendering primitives, and remote embed support | c3-107 |
| OUT | Dedicated transcript rendering branch for present_content messages | c3-111 |
| OUT | Concrete artifact examples used by prompt guidance, including embed-first recommendations | c3-207 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
| ref-mcp-app-hosting |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Tool normalization and renderer behavior stay covered end to end |
| rule-react-no-effects | The transcript renderer stays declarative |
| rule-rule-strict-typescript | present_content payloads remain typed across normalization and rendering |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-1 (client). This is the user-visible structured artifact path in the transcript: Codex or future runtimes can emit bounded content cards or direct embeds, and the client renders them through one dedicated feature instead of treating them as generic tool output.
