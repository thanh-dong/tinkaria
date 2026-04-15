---
id: c3-106
c3-seal: 3dd5c2f0ebf0613e9ddebb56eb8766d0f0c49bdb02ac63f00a0ee80e79880b8a
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

For `present_content` artifacts with `format: "pug"`, this component does not require server enrichment or a new transcript result shape. The corresponding update is local to the client render path: `c3-106` passes the original artifact source to `c3-107`, and `c3-107` treats Puggy as short-form static/safe HTML. `c3-204` remains the shared contract owner and owns the copied renderer files, but present_content payloads stay unchanged: no `compiledHtml`, no server precompile metadata, and no hydration contract expansion.
