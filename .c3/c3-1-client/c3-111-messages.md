---
id: c3-111
c3-seal: 2cd1f999c489b6c78fd83695947fea95d3a7bc36ca0d3a4de813405146513449
title: messages
type: component
category: feature
parent: c3-1
goal: Render transcript message surfaces and grouping boundaries for assistant responses, WIP narration/tool work, dedicated special-tool interactions, present_content artifacts, system/user/result/status messages, compact summaries, and rich artifact cards.
uses:
    - c3-106
    - c3-107
    - recipe-agent-turn-render-flow
    - ref-component-identity-mapping
    - ref-live-transcript-render-contract
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
    - rule-transcript-boundary-regressions
---

## Goal

Render transcript message surfaces and grouping boundaries for assistant responses, WIP narration/tool work, dedicated special-tool interactions, present_content artifacts, system/user/result/status messages, compact summaries, and rich artifact cards.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Processed message types and tool payloads from shared transcript typing | c3-204 |
| IN | Shared UI primitives used by message surfaces | c3-104 |
| IN | Dedicated present_content artifact renderer | c3-106 |
| IN | Shared rich-content overlays and viewer primitives | c3-107 |
| OUT | Message components consumed by transcript renderer | c3-119 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
| ref-live-transcript-render-contract |  |
| recipe-agent-turn-render-flow |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across message variants |
| rule-bun-test-conventions | Message rendering stays regression-tested |
| rule-react-no-effects | Message surfaces remain pure rendering components |
| rule-transcript-boundary-regressions |  |
## Container Connection

Part of c3-1 (client). ChatTranscript maps hydrated messages into render items, then message renderers own visible surfaces: WipBlock for progress/tool work, TextMessage for final or live assistant response text, PresentContentMessage for structured artifacts, and rich-content primitives for markdown/code/embed overlays. Assistant text may also auto-upgrade known embeddable links such as Diashort into rich artifact cards when the model emits a plain link instead of a dedicated present_content tool call.
