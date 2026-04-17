---
id: ref-live-transcript-render-contract
c3-seal: f502a145a18387bd7a0a2448978d075f735dae5098944f9c3bdfec478eeca394
title: live-transcript-render-contract
type: ref
goal: Make live transcript rendering enforceable from provider stream to stable render units and delivery-machine-owned visible state. Provider stream entries become immutable transcript facts, the shared/server projection emits render-ready units, and the client delivery machine decides when a projection becomes visible.
---

## Goal

Make live transcript rendering enforceable from provider stream to stable render units and delivery-machine-owned visible state. Provider stream entries become immutable transcript facts, the shared/server projection emits render-ready units, and the client delivery machine decides when a projection becomes visible.

## Choice

Treat transcript rendering as a boundary contract, not a visual detail. The contract now spans server runner output, transcript event consumption, shared transcript/tool typing, render-unit projection, NATS snapshot/render-window delivery, the transcript delivery state machine, and message-specific renderers. `ChatTranscript` is a renderer of units only; it must not group, hide, fetch, hydrate, or reinterpret transcript facts.

## Why

Most regressions happen between components: raw stream entries can arrive faster than snapshots, tool results attach to prior tool calls, dedicated interactive tools need visible rationale, present_content must remain an artifact, and equivalent transcript windows must not remount or fade repeatedly during a turn. The render-unit projection plus delivery state machine make these boundaries explicit and testable.

## How

Golden path:

1. Agent/provider harness emits ordered transcript entries: assistant_text, tool_call, tool_result, result, status/compact/session metadata.
2. Server transcript-runtime appends immutable entries and publishes raw events as delivery signals.
3. Shared projection in src/shared/transcript-render.ts folds ordered TranscriptEntry windows into TranscriptRenderUnit arrays with deterministic source-entry ids.
4. Server read models and chat.getRenderUnits expose bounded render-unit windows with explicit freshness metadata in the state-machine ref.
5. Client transcript lifecycle delegates apply/ignore decisions to the delivery state machine. Raw transcript events mark projection stale; they do not directly mutate visible units.
6. ChatTranscript renders the visible units and dispatches to message renderers. WipBlock renders progress chrome, TextMessage renders assistant content, PresentContentMessage renders structured artifacts, and dedicated tools own their interactions.
For the anti-flash state-machine contract, use ref-transcript-render-state-machine. If a change touches one step, verify both the producing side and the visible rendering side.
