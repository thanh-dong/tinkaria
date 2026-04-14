---
id: ref-live-transcript-render-contract
c3-seal: caa25ad1caa9a6cc03aec9d6c8d317ea6d5d53dac844610f1de9d3e2bdc50992
title: live-transcript-render-contract
type: ref
goal: 'Make the live agent flow transcript render interaction enforceable: provider stream entries become hydrated messages, hydrated messages become stable render groups, and WIP, assistant, special-tool, and present_content artifact surfaces keep distinct user-visible roles.'
---

## Goal

Make the live agent flow transcript render interaction enforceable: provider stream entries become hydrated messages, hydrated messages become stable render groups, and WIP, assistant, special-tool, and present_content artifact surfaces keep distinct user-visible roles.

## Choice

Treat transcript rendering as a boundary contract, not a visual detail. The contract spans server agent output, shared transcript/tool typing, client hydration, `ChatTranscript.groupMessages`, and message-specific renderers.

## Why

Most regressions here happen between components: a tool result mutates an existing tool call, live trailing assistant text can be mistaken for WIP narration, special interactive tools need visible rationale text, and `present_content` must render as a first-class artifact instead of generic tool chrome. Component docs alone hide those cross-boundary invariants.

## How

Golden path:

1. Agent/provider harness emits ordered transcript entries: `assistant_text`, `tool_call`, `tool_result`, `result`, status/compact/session metadata.
2. Shared normalization in `src/shared/tools.ts` assigns semantic `toolKind` values before UI code sees tools.
3. Client hydration in `src/client/lib/parseTranscript.ts` links `tool_result` back to the pending `tool_call`, mutates that hydrated tool in place, and returns a new message array reference when dirty.
4. `src/client/app/ChatTranscript.tsx` groups non-error generic tools plus narration into WIP blocks, keeps special tools (`AskUserQuestion`, `ExitPlanMode`, `TodoWrite`, `present_content`) as dedicated visible surfaces, and keeps the current live answer visible after prior tool activity.
5. `WipBlock` renders progress/navigation chrome only; final assistant content belongs to `TextMessage`; structured artifacts belong to `PresentContentMessage` and rich-content primitives.
Do not collapse these roles. If a change touches one step, verify both the producing side and the rendering side.
