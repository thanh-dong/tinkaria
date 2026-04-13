---
id: c3-111
c3-seal: 7ced98a85a3c658b1eb459b221383cede7677b6bf8479f577e8ecb567a3468eb
title: messages
type: component
category: feature
parent: c3-1
goal: Render the transcript message surfaces for text, tool calls, system messages, user messages, results, plan UI, compact summaries, WIP narration blocks, and specialized artifact cards.
uses:
    - c3-106
    - c3-107
    - ref-component-identity-mapping
    - rule-bun-test-conventions
    - rule-react-no-effects
    - rule-rule-strict-typescript
---

## Goal

Render the transcript message surfaces for text, tool calls, system messages, user messages, results, plan UI, compact summaries, and specialized artifact cards.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Processed message types and tool payloads from shared transcript typing | c3-204 |
| IN | Shared UI primitives (Card, ScrollArea, Button) | c3-104 |
| IN | Dedicated present_content artifact renderer | c3-106 |
| IN | Shared rich-content overlays and viewer primitives | c3-107 |
| OUT | Rendered message components consumed by the chat transcript shell | c3-110 |
## Related Refs

| Ref | Role |
| --- | --- |
| ref-component-identity-mapping |  |
## Related Rules

| Rule | Constraint |
| --- | --- |
| rule-rule-strict-typescript | Strict typing enforced across message variants |
| rule-bun-test-conventions | Message rendering stays regression-tested |
| rule-react-no-effects | Message surfaces remain pure rendering components |
## Container Connection

Part of c3-1 (client). This is the transcript presentation layer: TinkariaTranscript maps processed messages into these renderers, with structured artifact cards delegated to c3-106 and shared rich-content primitives coming from c3-107. Assistant text may also auto-upgrade known embeddable links such as Diashort into rich artifact cards when the model emits a plain link instead of a dedicated `present_content` tool call.
