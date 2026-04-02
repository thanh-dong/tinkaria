# Rich Content SVG Rendering

Render fenced `svg` blocks in transcript rich content as image-first content inside the existing rich-content viewer, while preserving access to the raw SVG source.

## Goal

Kanna's transcript rich-content pipeline already upgrades fenced code blocks into `RichContentBlock` and routes selected languages through `EmbedRenderer`. Today that embed classifier only recognizes `mermaid` and `d2`, so fenced `svg` content falls through to the generic code path and shows literal XML markup instead of the rendered image.

The goal is to extend the current transcript rich-content path, not redesign it:

- Fenced ````svg` blocks should render as SVG graphics by default.
- The user should still be able to inspect and copy the raw SVG source from the same rich-content surface.
- Existing markdown, code, mermaid, and d2 behavior should remain stable.

## Non-Goals

- No support for raw `<svg>...</svg>` HTML embedded directly in markdown paragraphs.
- No generalized mode-switching system for all rich-content types in this change.
- No new modal or browser-companion workflow.
- No server-side SVG transformation or sanitization service.
- No change to file preview behavior unless it already routes through the same fenced-block embed path.

## Current Behavior

The current transcript rendering path is:

1. `TextMessage` renders assistant text through `react-markdown`.
2. `createMarkdownComponents().pre` intercepts fenced code blocks.
3. If the fenced language is classified as an embed, the block renders as `type="embed"` and is delegated to `EmbedRenderer`.
4. Otherwise the block renders as a standard code-rich-content block.

Today, `svg` is not in the embed language set. That means fenced `svg` blocks are treated as generic code and syntax-highlighted as text.

## Desired User Experience

When a transcript message contains:

````markdown
```svg
<svg viewBox="0 0 100 100">...</svg>
```
````

the message should display an existing `RichContentBlock` with SVG-specific behavior:

- The default inline view shows the rendered SVG.
- The block still uses the normal rich-content shell: expand/collapse, overlay button, title, copy affordance.
- The user can switch to a source view to inspect or copy the raw SVG markup.
- Opening the overlay preserves the same rendered-first behavior and still allows source access.

If the SVG source is invalid or cannot be rendered:

- The block should show a clear render error state.
- The raw source remains accessible so the content is never lost.

## C3 Context

This work stays within the existing client-side message and rich-content topology:

- `c3-111` `messages` owns markdown transcript rendering and the `pre` override path.
- The rich-content components currently live outside the codemap and should be documented if implementation broadens their architectural role.

Expected file lookups before implementation:

- `src/client/components/messages/TextMessage.tsx`
- `src/client/components/messages/shared.tsx`
- `src/client/components/rich-content/EmbedRenderer.tsx`
- `src/client/components/rich-content/RichContentBlock.tsx`
- `src/client/components/rich-content/ContentOverlay.tsx`

## C3 Rules To Honor

### Rules

- `rule-react-no-effects`: avoid introducing new effects for mode synchronization or derived view state. If a local UI toggle is needed for SVG source/render modes, it should remain event-driven state, not effect-driven state.
- `rule-bun-test-conventions`: add focused Bun tests for SVG classification, SVG rendering behavior, and transcript markdown integration.
- `rule-rule-strict-typescript`: keep renderer props typed and format checks explicit.
- `rule-error-extraction`: any caught SVG parse/render errors must be normalized safely.

## Approach Options

### Option 1: Extend the current embed pipeline for `svg` and add an SVG-specific renderer

Add `svg` to the embed language set and teach `EmbedRenderer` a dedicated SVG path.

Pros:

- Smallest change.
- Reuses the current transcript rich-content architecture.
- Fixes the reported issue directly.

Cons:

- Introduces a format-specific view-mode branch inside the existing renderer.

### Option 2: Build a generalized multi-mode rich-content viewer first

Refactor `RichContentBlock` and `ContentOverlay` to natively understand multiple content modes for all rich content types.

Pros:

- Cleaner long-term abstraction if markdown, SVG, diagrams, and diffs all need alternate views.

Cons:

- Larger scope than the current need.
- Higher regression risk across unrelated rich-content types.

### Option 3: Special-case SVG upstream in markdown parsing

Detect fenced `svg` blocks before the standard `pre` path and render a dedicated component outside `EmbedRenderer`.

Pros:

- Keeps `EmbedRenderer` narrower.

Cons:

- Duplicates existing embed routing logic.
- Makes the markdown override layer less coherent.

### Recommendation

Use Option 1. The problem is not that transcript rich content lacks architecture; it already has the correct shell and routing point. The missing piece is that `svg` is not recognized as an embeddable fenced format, and there is no SVG renderer behind that path.

## Implementation Shape

### Embed classification

Extend `isEmbedLanguage()` so `svg` is treated as an embed format alongside `mermaid` and `d2`.

That change should affect both transcript markdown and any other existing markdown surfaces that already reuse `createMarkdownComponents()`.

### SVG renderer

Add an SVG-specific branch in `EmbedRenderer`:

- Input remains the raw fenced code contents as a string.
- The default visible mode is rendered SVG.
- The alternate mode is source.
- The rendered mode should mount the SVG markup directly into a controlled container so the browser paints it as graphics rather than escaped text.

Important rendering constraints:

- The renderer must keep the output bounded to the message width.
- Large SVGs should scale down to fit the content column while preserving aspect ratio.
- The source mode should use the same readable monospace treatment as existing code-like rich content.

### View mode surface

For this change, mode switching should be SVG-specific rather than generalized across all rich content types.

Recommended minimal surface:

- Inline block: render-first with a small `Render` / `Source` toggle in the block body or header.
- Overlay: same toggle, same default mode.

The toggle state does not need to persist across messages or sessions.

### Error handling

If SVG mounting fails or the source is obviously invalid:

- Show a compact error label such as `SVG render error`.
- Fall back to the source mode or keep source immediately accessible.
- Do not discard the raw content.

### Security posture

This feature should only render fenced `svg` content that already passed through the transcript markdown path. Do not enable generic raw HTML rendering for markdown as part of this change.

If implementation reveals a security concern with directly mounting arbitrary SVG markup, the fallback is:

- keep `svg` classified as embed,
- show source by default with an explicit render action behind a narrower guard,
- or restrict rendering to the minimal safe subset that can be implemented confidently.

The first implementation should stay conservative and explicit.

## Testing

Follow RED-GREEN-TDD.

### Delivery discipline

1. Start with failing tests for embed classification and SVG rendering behavior.
2. Implement the minimum code to pass.
3. Do a no-slop pass.
4. Do a simplify pass.
5. Do a review pass before calling the feature done.

### Focused tests

#### `EmbedRenderer`

- `isEmbedLanguage("svg")` returns `true`.
- `format="svg"` renders the SVG-first surface instead of the generic text fallback.
- Invalid SVG produces a visible error/fallback state without losing source visibility.

#### Markdown rich-content integration

- A fenced `svg` block in transcript markdown routes through `RichContentBlock` as `type="embed"`.
- The rendered SVG path appears instead of syntax-highlighted XML code.

#### Regression coverage

- Mermaid behavior is unchanged.
- D2 fallback behavior is unchanged.
- Non-embed code fences still render as code blocks.

## Risks

### Unsafe SVG assumptions

SVG is XML and can contain more than simple shapes. The implementation should avoid broad HTML enablement and keep the renderer narrowly scoped to the fenced embed path.

### Rich-content UI drift

If the toggle UI is implemented separately inline and in overlay, they can diverge. Keep the render/source mode content shared where possible.

### Scope creep into a universal viewer

The request mentions future multi-mode content. That is directionally useful, but this implementation should not generalize the entire rich-content system yet unless the SVG fix becomes awkward without it.

## Minimal File Scope

- Modify `src/client/components/messages/shared.tsx`
- Modify `src/client/components/rich-content/EmbedRenderer.tsx`
- Potentially modify `src/client/components/rich-content/RichContentBlock.tsx`
- Potentially modify `src/client/components/rich-content/ContentOverlay.tsx`
- Add or update focused tests in `src/client/components/rich-content/EmbedRenderer.test.tsx`
- Add or update focused tests in `src/client/components/messages/shared.test.tsx`

## Verification Plan

- `bun test src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx`
- `bun run build`
- `c3x check`

## Open Decision

The default design assumes the SVG render/source toggle appears anywhere SVG rich content is shown, including the overlay, and always defaults to `Render`.

If implementation pressure suggests the inline transcript should be render-only while the overlay exposes the source toggle, that is an acceptable fallback only if the render-first transcript behavior still lands in this change.
