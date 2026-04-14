---
id: c3-119
c3-seal: 8df40ca4f1d8fbd09caeb3ba668b4cac3e1be68beae7ae62d37770b7f34fe1d5
title: transcript-renderer
type: component
category: feature
parent: c3-1
goal: 'Own transcript render interaction: virtualized render items, assistant answer detection, WIP/tool grouping, dedicated-tool boundaries, scroll measurement, and dispatch into message renderers.'
uses:
    - c3-106
    - c3-107
    - c3-111
    - c3-118
    - recipe-agent-turn-render-flow
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Own transcript render interaction: virtualized render items, assistant answer detection, WIP/tool grouping, dedicated-tool boundaries, scroll measurement, and dispatch into message renderers.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Hydrated messages from transcript lifecycle | c3-118 |
| IN | Message renderers for WIP, assistant text, tools, results, and artifacts | c3-111 |
| IN | present_content artifact renderer | c3-106 |
| IN | rich-content overlay/embed primitives | c3-107 |
| OUT | User-visible transcript rows inside the chat route | c3-110 |
## Container Connection

Part of c3-1 (client). This component is the rationale boundary for `ChatTranscript.groupMessages`: it decides which pieces of a live agent turn are progress, answer, interaction, or artifact before specialized message components render them.
