# Rich Content SVG Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render fenced `svg` transcript rich content as image-first content while preserving a source view inside the existing rich-content UI.

**Architecture:** Extend the existing fenced-code rich-content pipeline instead of adding a new transcript rendering path. Treat `svg` as an embed language in `shared.tsx`, add an SVG-specific renderer/mode switch in `EmbedRenderer.tsx`, and keep the existing `RichContentBlock` and overlay shells as the container surfaces for inline and fullscreen viewing.

**Tech Stack:** React 19, TypeScript, Bun test, react-markdown, lucide-react

---

## File Map

- Modify: `src/client/components/rich-content/EmbedRenderer.tsx`
  Responsibility: classify `svg` as an embed format and render SVG content with a `Render` / `Source` surface.
- Modify: `src/client/components/rich-content/EmbedRenderer.test.tsx`
  Responsibility: cover embed classification, SVG-first rendering, and fallback behavior.
- Modify: `src/client/components/messages/shared.tsx`
  Responsibility: route fenced `svg` blocks through the existing embed-rich-content path.
- Modify: `src/client/components/messages/shared.test.tsx`
  Responsibility: prove fenced `svg` markdown uses rich-content embed rendering instead of generic code formatting.
- Verify only: `src/client/components/rich-content/RichContentBlock.tsx`
  Responsibility: confirm the existing block shell is sufficient and does not need new props.
- Verify only: `src/client/components/rich-content/ContentOverlay.tsx`
  Responsibility: confirm the existing overlay shell composes with the SVG renderer without new mode-synchronization logic.

### Task 1: Add Failing SVG Embed Tests

**Files:**
- Modify: `src/client/components/rich-content/EmbedRenderer.test.tsx`
- Modify: `src/client/components/messages/shared.test.tsx`

- [ ] **Step 1: Extend the embed classification test with `svg`**

```tsx
test("returns true for svg", () => {
  expect(isEmbedLanguage("svg")).toBe(true)
})
```

- [ ] **Step 2: Add a renderer-level SVG-first test**

```tsx
test("renders svg content as an image-first embed surface", () => {
  const html = renderToStaticMarkup(
    <EmbedRenderer
      format="svg"
      source={'<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>'}
    />
  )

  expect(html).toContain("Render")
  expect(html).toContain("Source")
  expect(html).toContain("data-svg-render")
  expect(html).toContain("circle")
})
```

- [ ] **Step 3: Add an invalid-SVG fallback test**

```tsx
test("renders source-accessible fallback for invalid svg", () => {
  const html = renderToStaticMarkup(
    <EmbedRenderer format="svg" source={"<svg><g></svg>"} />
  )

  expect(html).toContain("SVG render error")
  expect(html).toContain("&lt;svg&gt;&lt;g&gt;&lt;/svg&gt;")
})
```

- [ ] **Step 4: Add a markdown integration test for fenced `svg`**

```tsx
test("routes fenced svg blocks through embed rich content", () => {
  const html = renderToStaticMarkup(
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {'```svg\n<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>\n```'}
    </Markdown>
  )

  expect(html).toContain("data-svg-render")
  expect(html).not.toContain("sh__token--keyword")
})
```

- [ ] **Step 5: Run the focused test files to verify RED**

Run:

```bash
bun test src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx
```

Expected:

```text
FAIL
```

The new `svg` assertions should fail because the current embed classifier only knows `mermaid` and `d2`, and the renderer falls back to generic text.

- [ ] **Step 6: Commit the failing tests**

```bash
git add src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx
git commit -m "test: add svg rich content coverage"
```

### Task 2: Implement SVG Embed Classification And Renderer

**Files:**
- Modify: `src/client/components/rich-content/EmbedRenderer.tsx`

- [ ] **Step 1: Add `svg` to the embed language set**

```ts
const EMBED_LANGUAGES = new Set(["mermaid", "d2", "svg"])
```

- [ ] **Step 2: Add a typed SVG source validator/parser**

```ts
function parseSvgMarkup(source: string): { ok: true } | { ok: false; message: string } {
  const trimmed = source.trim()
  if (!trimmed.startsWith("<svg") || !trimmed.endsWith("</svg>")) {
    return { ok: false, message: "SVG render error" }
  }

  return { ok: true }
}
```

Keep the first implementation conservative. It only needs to separate obviously valid fenced SVG markup from obvious failures and avoid broad raw-HTML markdown enablement.

- [ ] **Step 3: Add an SVG renderer branch before the D2 fallback**

```tsx
if (format === "svg") {
  return <SvgEmbed source={source} />
}
```

- [ ] **Step 4: Implement an event-driven `SvgEmbed` component with render/source modes**

```tsx
function SvgEmbed({ source }: { source: string }) {
  const [mode, setMode] = useState<"render" | "source">("render")
  const parsed = parseSvgMarkup(source)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMode("render")}>Render</button>
        <button type="button" onClick={() => setMode("source")}>Source</button>
      </div>
      {mode === "render" && parsed.ok ? (
        <div
          data-svg-render="true"
          className="flex items-center justify-center overflow-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: source }}
        />
      ) : (
        <div className="p-3 text-xs font-mono">
          {!parsed.ok ? <div className="mb-2 text-xs text-destructive">SVG render error</div> : null}
          <pre className="whitespace-pre-wrap break-all text-foreground">{source}</pre>
        </div>
      )}
    </div>
  )
}
```

Keep this local UI state only. Do not introduce effects for mode derivation or overlay synchronization.

- [ ] **Step 5: Preserve the existing mermaid and D2 behavior**

Do not change the `mermaid` branch or the D2/generic fallback copy beyond the minimum refactor needed to insert `svg`.

- [ ] **Step 6: Run the focused tests to verify GREEN**

Run:

```bash
bun test src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx
```

Expected:

```text
pass
```

- [ ] **Step 7: Commit the minimal implementation**

```bash
git add src/client/components/rich-content/EmbedRenderer.tsx src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx
git commit -m "feat: render svg rich content embeds"
```

### Task 3: Verify Transcript Integration And Prevent UI Drift

**Files:**
- Modify: `src/client/components/messages/shared.tsx`
- Verify: `src/client/components/rich-content/RichContentBlock.tsx`
- Verify: `src/client/components/rich-content/ContentOverlay.tsx`

- [ ] **Step 1: Confirm `shared.tsx` requires no new routing logic beyond `isEmbedLanguage("svg")`**

The current `pre` override should continue to work unchanged:

```tsx
const language = extractLanguageFromChildren(children)
const isEmbed = isEmbedLanguage(language)

return (
  <RichContentBlock
    type={isEmbed ? "embed" : "code"}
    title={language ?? "Code"}
    rawContent={textContent}
    defaultExpanded={autoExpand}
  >
    {isEmbed && language ? (
      <EmbedRenderer format={language} source={textContent} />
    ) : (
      ...
    )}
  </RichContentBlock>
)
```

If implementation changed this behavior while making tests pass, simplify it back to this shape unless there is a proven blocker.

- [ ] **Step 2: Verify the existing overlay shell does not need SVG-specific props**

The overlay should remain a generic wrapper:

```tsx
<ContentOverlay
  open={overlayOpen}
  onOpenChange={setOverlayOpen}
  title={displayTitle}
  type={type}
  rawContent={rawContent}
>
  {children}
</ContentOverlay>
```

Because the SVG mode switch lives inside `EmbedRenderer`, inline and overlay views stay behaviorally aligned without cross-component mode plumbing.

- [ ] **Step 3: Run the full rich-content regression set**

Run:

```bash
bun test src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/rich-content/ContentOverlay.test.tsx
```

Expected:

```text
pass
```

- [ ] **Step 4: Run the app build**

Run:

```bash
bun run build
```

Expected:

```text
vite build completes successfully
```

- [ ] **Step 5: Run C3 validation**

Run:

```bash
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected:

```json
{"issues":[]}
```

- [ ] **Step 6: Commit the verification-clean implementation**

```bash
git add src/client/components/messages/shared.tsx src/client/components/rich-content/EmbedRenderer.tsx src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx
git commit -m "refactor: finalize svg rich content rendering"
```

### Task 4: No-Slop Pass, Simplify Pass, Review Pass

**Files:**
- Modify only if needed: `src/client/components/rich-content/EmbedRenderer.tsx`
- Modify only if needed: `src/client/components/messages/shared.tsx`
- Modify only if needed: related focused tests

- [ ] **Step 1: No-slop pass**

Check for avoidable complexity:

```text
- duplicated source/render markup
- SVG-specific branches leaking into shared markdown code
- unnecessary new props on RichContentBlock or ContentOverlay
```

Remove any code that is not directly required by the passing tests and approved spec.

- [ ] **Step 2: Simplify pass**

Collapse any extractable, single-purpose helpers introduced during GREEN:

```ts
type SvgMode = "render" | "source"
```

Prefer one small parser/helper and one renderer component over scattered conditionals.

- [ ] **Step 3: Review pass**

Read the final diff and verify:

```text
- svg is image-first
- source remains accessible
- raw <svg> markdown HTML was not enabled
- mermaid/d2/code behavior did not regress
```

- [ ] **Step 4: Re-run final verification**

Run:

```bash
bun test src/client/components/rich-content/EmbedRenderer.test.tsx src/client/components/messages/shared.test.tsx src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/rich-content/ContentOverlay.test.tsx
bun run build
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected:

```text
All commands pass.
```

- [ ] **Step 5: Final commit**

```bash
git add src/client/components/messages/shared.tsx src/client/components/messages/shared.test.tsx src/client/components/rich-content/EmbedRenderer.tsx src/client/components/rich-content/EmbedRenderer.test.tsx
git commit -m "feat: support svg transcript rich content"
```
