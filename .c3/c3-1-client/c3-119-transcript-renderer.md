---
id: c3-119
c3-seal: 1f82a9b1ace6dfa924e33448f52959ff762cb9178f66842a55cedde7697d8733
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

### Core Data Flow

`ChatTranscript` receives `HydratedTranscriptMessage[]` from c3-118 and transforms them into `RenderItem[]` via `groupMessages()`, then renders through `@tanstack/react-virtual` virtualization.

### RenderItem Types

Three discriminated union variants:

- **single**: One message rendered directly (user, assistant answer, system, result, dedicated tools, etc.)
- **tool-group**: 2+ consecutive collapsible tool calls, rendered as `CollapsedToolGroup`
- **wip-block**: Narration text + collapsible tools, rendered as `WipBlock`
### The groupMessages Algorithm

`groupMessages(messages, isLoading)` runs two passes:

**Pass 1 — Find the Answer** (`findAnswerIndex`)

Search backward for the last `assistant_text` not followed by a `tool_call`:

| Turn State | Behavior |
| --- | --- |
| Completed (not loading) | Last assistant_text = the answer, always shown |
| Streaming, tail is text with prior tool activity | Keep tail visible as live answer |
| Streaming, tail is text with only prior narration | Suppress (return -1) to prevent transient prose flash before next tool |
| Pass 2 — Main Grouping Loop |  |
Iterates messages left-to-right, three branches:

1. **WIP Block Formation** — triggered by `assistant_text` at index != answerIndex:
**WIP Block Formation** — triggered by `assistant_text` at index != answerIndex:
- Start: `steps = [message]`
- Absorb loop: consume consecutive `assistant_text` or collapsible tool calls (never dedicated tools)
- Eject trailing text: if next message is a dedicated/special tool, pop trailing `assistant_text` from steps → emit as separate singles (preserves rationale text above interactive blocks)
- Emit: `wip-block` if steps >= 2, or >= 1 during loading; else `single`
1. **Tool Group Formation** — triggered by collapsible tool call (non-error, non-dedicated):
**Tool Group Formation** — triggered by collapsible tool call (non-error, non-dedicated):
- Absorb consecutive collapsible tools
- Emit: `tool-group` if group >= 2; else `single`
1. **Fallthrough** — everything else: `single`
**Fallthrough** — everything else: `single`
### Dedicated Tool Boundaries

Tools that NEVER enter WIP blocks or tool groups:

`DEDICATED_RENDER_TOOL_NAMES` includes all SPECIAL_TOOL_NAMES plus `present_content`.

SPECIAL_TOOL_NAMES: AskUserQuestion, ExitPlanMode, TodoWrite.

These always render as `type: "single"` with their own dedicated renderer component.

Detection: `isCollapsibleToolCall()` returns false for dedicated tools. `isWipAbsorbable()` returns false for dedicated tools.

### Virtualization

Uses `@tanstack/react-virtual` with:

- `estimateSize`: Pre-layout height estimation per RenderItem
- `overscan: 5`: Render 5 items beyond visible viewport
- Absolutely positioned divs with `transform: translateY()`
- `measureElement` ref callback for actual DOM height measurement
Height estimation (messageHeights.ts):
| RenderItem | Estimate |
| --- | --- |
| tool-group | 64px fixed |
| wip-block | 72px fixed |
| assistant_text | Text layout via pretext library (line height + paragraph gaps + padding) |
| user_prompt | Layout at 80% width + padding |
| system_init | 48px |
| result | 40px |
| other kinds | 80px default |
| Font readiness: useMessageHeights waits for waitForFont() before enabling accurate layout. |  |
### Render Dispatch

Each virtual row maps to a RenderItem and dispatches:

| RenderItem type | Component |
| --- | --- |
| tool-group | CollapsedToolGroup |
| wip-block | WipBlock |
| single (assistant_text at answerIndex) | TextMessage |
| single (tool with toolKind) | Per-kind dedicated renderer or generic ToolCallMessage |
| single (user_prompt) | UserMessage |
| single (system_init) | SystemMessage |
| single (result) | ResultMessage |
| single (status) | StatusMessage |
| single (compact_boundary) | CompactBoundaryMessage |
| single (compact_summary) | CompactSummaryMessage |
| single (interrupted) | InterruptedMessage |
| single (context_cleared) | ContextClearedMessage |
| single (account_info) | AccountInfoMessage |
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
