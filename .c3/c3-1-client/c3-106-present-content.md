---
id: c3-106
c3-seal: 3cbb0cd06b0c62172b811eb514163d83f3b54f4576700864bb0ff65566b1027a
title: present-content
type: component
category: feature
parent: c3-1
goal: Dedicated present_content transcript feature that normalizes typed content artifacts, including direct embeds, and renders them as rich cards instead of generic tool text.
uses:
    - c3-107
    - ref-component-identity-mapping
    - ref-mcp-app-hosting
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
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
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-bun-test-conventions | Tool normalization and renderer behavior stay covered end to end |
| rule-react-no-effects | The transcript renderer stays declarative |
| rule-rule-strict-typescript | present_content payloads remain typed across normalization and rendering |
## Container Connection

Part of c3-1 (client). This is the user-visible structured artifact path in the transcript: Codex or future runtimes can emit bounded content cards or direct embeds, and the client renders them through one dedicated feature instead of treating them as generic tool output.
