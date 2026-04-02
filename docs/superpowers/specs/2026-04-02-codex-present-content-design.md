# Codex Present Content Design

## Goal

Expose a first-class Codex dynamic tool path for structured transcript content so Kanna can render dedicated content cards with `AskUserQuestion`-level integration quality instead of relying only on assistant markdown conventions.

## Context

Kanna already renders rich markdown and fenced rich content well in the transcript, but that path is purely text-driven. Codex can be told to emit markdown, diagrams, and code blocks, yet Kanna cannot distinguish "the agent intentionally wants to present a structured content artifact" from ordinary assistant prose.

`AskUserQuestion` works better because it is not inferred from text. Codex app-server emits a dedicated server request, Kanna normalizes it into a typed transcript tool call, persists the structured payload, and renders a purpose-built UI component for it. That explicit contract is the quality bar for a reusable content-surface feature.

The official Codex App Server protocol already exposes the matching primitive we need: experimental dynamic tools via `item/tool/call`, with a response payload containing `contentItems`. Kanna currently does not advertise any dynamic tools on turn start, only handles `update_plan`, and flattens dynamic tool output to plain text for generic tool results.

## Problem

We need a way for Codex to intentionally surface structured content in Kanna as a transcript-native artifact, not just as markdown inside an assistant message.

The solution must:

1. Preserve explicit machine-readable intent from Codex.
2. Round-trip through Kanna's existing transcript event store.
3. Render via dedicated transcript UI instead of generic tool JSON.
4. Fall back safely to assistant markdown if dynamic-tool presentation is unavailable.

## Non-Goals

This design does not:

1. Generalize all dynamic tools in one pass.
2. Make `inputImage` the primary presentation contract.
3. Replace existing markdown rich-content rendering.
4. Introduce a separate out-of-band side panel or modal-only content system.
5. Redesign Claude provider behavior.

## Design Overview

Add one client-owned Codex dynamic tool named `present_content`.

On each Codex turn, Kanna advertises `present_content` in the app-server `turn/start` request. Codex may invoke this tool when it wants a dedicated content card in the transcript. Kanna normalizes that invocation into a typed transcript tool call and stores the structured payload as the tool result. The client transcript then renders a dedicated `PresentContentMessage` component for this tool kind.

This mirrors the `AskUserQuestion` architecture:

1. Protocol-level capability advertisement.
2. Typed normalization in shared transcript types.
3. Persisted tool call + tool result entries.
4. Dedicated transcript renderer.

## Dynamic Tool Contract

### Tool name

`present_content`

### Invocation intent

Codex should call `present_content` when the content is better represented as a dedicated artifact than as inline prose, for example:

1. Architecture notes with a short diagram or clearly bounded code sample.
2. A generated document fragment that should be visually separated from narration.
3. A deliberate "here is the artifact" moment where the transcript benefits from structure and replayability.

Codex should continue using normal assistant text for ordinary explanation and should not spam `present_content` for every code block.

### Arguments schema

The first version uses a strict JSON payload:

```ts
interface PresentContentInput {
  title: string
  kind: "markdown" | "code" | "diagram"
  format: "markdown" | "text" | "json" | "typescript" | "javascript" | "tsx" | "jsx" | "python" | "bash" | "mermaid" | "d2" | "svg"
  source: string
  summary?: string
  collapsed?: boolean
}
```

Rules:

1. `title` is required and user-facing.
2. `kind` controls default presentation semantics.
3. `format` controls renderer selection.
4. `source` is the canonical raw content persisted in the transcript.
5. `summary` is optional short framing text for the card header/body.
6. `collapsed` is an optional initial preference only.

### Tool response contract

Kanna responds with a success payload that echoes structured content back through dynamic tool `contentItems` as text only for now:

```ts
interface PresentContentResult {
  accepted: true
}
```

`contentItems` should return a short text acknowledgement such as `"presented"` for protocol completeness, but Kanna's authoritative transcript rendering should rely on the persisted tool result object, not on re-parsing that acknowledgement text.

## Server Architecture

### Turn start

Extend the vendored app-server protocol types to support `dynamicTools` on `TurnStartParams`. `CodexAppServerManager.startTurn()` should include a `present_content` tool definition on every Codex turn.

### Dynamic tool handling

Add a specialized branch in `handleServerRequest()` for `item/tool/call` with `tool === "present_content"`.

Behavior:

1. Validate and normalize the arguments into a typed `PresentContentInput`.
2. Emit a typed `tool_call` transcript entry instead of an `unknown_tool`.
3. Emit a structured `tool_result` transcript entry containing the normalized payload.
4. Respond to app-server with `success: true`.

Unsupported dynamic tools should continue using the existing generic failure path.

### Failure handling

If arguments are invalid:

1. Emit a typed `present_content` tool call if enough identity exists to correlate the failure.
2. Emit an error tool result with a clear message.
3. Return `success: false`.

Validation must normalize safely and never crash the turn.

## Shared Type System

Add a new tool kind to the shared transcript model:

1. `PresentContentToolCall`
2. `PresentContentToolResult`
3. `HydratedPresentContentToolCall`

The normalized tool input should hold only the request metadata needed for identity and replay. The result should hold the accepted structured artifact:

```ts
interface PresentContentToolResult {
  title: string
  kind: "markdown" | "code" | "diagram"
  format: string
  source: string
  summary?: string
  collapsed?: boolean
  accepted: true
}
```

Hydration should preserve this result as structured data, not stringify it.

## Client Rendering

Add a dedicated transcript component, `PresentContentMessage`.

Rendering rules:

1. If `format` is `markdown`, render markdown content with the existing markdown component pipeline.
2. If `format` is an embed language already supported by `EmbedRenderer` such as `mermaid`, `d2`, or `svg`, render it through the existing rich-content embed path.
3. Otherwise render it through `RichContentBlock` as code-like content, using the provided `format` as the title/language hint.
4. If `summary` exists, show it as short framing text above the artifact body.
5. Respect `collapsed` as the initial inline expanded state only.

The renderer should reuse existing rich-content building blocks instead of inventing a second content-shell system.

## Prompting Contract

Update the Codex web-context/developer instructions so Codex knows:

1. Kanna supports a dynamic tool named `present_content`.
2. It should use the tool sparingly for deliberate artifact presentation.
3. It should fall back to rich markdown in normal assistant text if the tool is unavailable or unsuitable.

This instruction should be Codex-specific and additive to the current web-context prompt.

## Why Not Use Assistant Markdown Only

Assistant markdown remains the fallback, but it is not sufficient as the primary solution because:

1. There is no explicit machine-readable "present this artifact" intent.
2. The transcript cannot distinguish intentional cards from ordinary prose.
3. Later enhancements such as filtering, analytics, or specialized card actions would have to infer structure from text.

Using a dedicated dynamic tool keeps the intent explicit and durable.

## Why Not Use `inputImage` First

The dynamic tool response protocol supports `inputImage`, but Kanna does not yet have an end-to-end typed image artifact path for Codex dynamic tool calls. Starting with text-backed structured payloads keeps the first implementation reliable and testable.

Image-backed presentation can be added later once Kanna has a typed dynamic content item model instead of flattening image URLs into generic text output.

## Files In Scope

Expected primary files:

1. `src/server/codex-app-server-protocol.ts`
2. `src/server/codex-app-server.ts`
3. `src/server/agent.ts`
4. `src/shared/types.ts`
5. `src/shared/tools.ts`
6. `src/client/lib/parseTranscript.ts`
7. `src/client/app/KannaTranscript.tsx`
8. `src/client/components/messages/types.ts`
9. `src/client/components/messages/PresentContentMessage.tsx`
10. Focused test files adjacent to the above modules

## Testing Strategy

Use RED-GREEN-TDD throughout.

Required coverage:

1. Protocol-level test that Codex turn start advertises the `present_content` dynamic tool.
2. Server test that a `present_content` dynamic tool call is normalized into the right transcript call/result entries.
3. Shared hydration test that structured results survive transcript processing.
4. Client transcript test that the new tool kind renders `PresentContentMessage`.
5. UI tests for markdown, embed, and code-style presentation paths.
6. Regression test that unsupported dynamic tools still fail through the generic path.

## Verification

Minimum verification before calling the work complete:

1. Targeted Bun tests for server, shared, and client transcript/rendering coverage.
2. `bun run build`
3. `c3x check`
4. `bunx @typescript/native-preview --noEmit -p tsconfig.json` if the pre-existing `baseUrl` issue is resolved; otherwise record the existing blocker explicitly.

## Open Questions Resolved

### Should this be a general dynamic tool framework first?

No. Start with one high-value typed tool. Generalization can follow once the seam is proven.

### Should the content shell be brand-new?

No. Reuse `RichContentBlock`, markdown components, and `EmbedRenderer` so the new feature lands inside the established transcript visual language.

### Should the fallback remain available?

Yes. Assistant markdown fallback stays intentionally supported so Codex can still communicate well even if the dynamic tool path is not taken.

## Chosen Direction

Implement a first-class Codex dynamic tool named `present_content`, typed end-to-end, rendered by a dedicated transcript component that reuses existing rich-content primitives, and backed by a markdown fallback contract for resilience.
