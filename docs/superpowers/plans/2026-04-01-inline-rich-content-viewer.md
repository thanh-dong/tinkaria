# Inline Rich Content Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collapsible, expandable rich content blocks (code, markdown, diffs, embeds) to the chat transcript with an overlay viewer, so users can collapse/expand inline and open any content in a full-screen Dialog.

**Architecture:** Client-side only. A `RichContentBlock` wrapper component wraps content in a collapsible card with an overlay trigger. It's integrated at the markdown renderer level (`pre`/`code` components in `shared.tsx`), at `FileContentView` for diffs, and at `TextMessage` for long markdown. A custom remark plugin detects `<!-- richcontent: autoExpand -->` HTML comments and sets initial expanded state. The overlay reuses the existing Radix Dialog primitive with a new `xl` size.

**Tech Stack:** React 19, Radix Dialog, Tailwind CSS 4, Bun test, react-markdown, remark-gfm, mermaid (lazy-loaded)

**Spec:** `docs/superpowers/specs/2026-04-01-inline-rich-content-viewer-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/client/components/rich-content/types.ts` | CREATE | `RichContentType` union and shared type definitions |
| `src/client/components/rich-content/ContentOverlay.tsx` | CREATE | Dialog-based overlay panel for immersive content viewing |
| `src/client/components/rich-content/RichContentBlock.tsx` | CREATE | Wrapper: collapsible inline card + overlay trigger |
| `src/client/components/rich-content/RichContentBlock.test.ts` | CREATE | Unit tests for RichContentBlock rendering states |
| `src/client/components/rich-content/EmbedRenderer.tsx` | CREATE | Mermaid diagram → SVG renderer (lazy-loaded) |
| `src/client/components/rich-content/EmbedRenderer.test.ts` | CREATE | Unit tests for embed type detection |
| `src/client/components/rich-content/remarkRichContentHint.ts` | CREATE | Remark plugin to detect `<!-- richcontent: autoExpand -->` |
| `src/client/components/rich-content/remarkRichContentHint.test.ts` | CREATE | Unit tests for remark plugin |
| `src/client/components/messages/shared.tsx` | MODIFY | Wrap `pre` component in `RichContentBlock`, export `extractText` |
| `src/client/components/messages/TextMessage.tsx` | MODIFY | Wrap long messages in `RichContentBlock`, add remark plugin |
| `src/client/components/messages/FileContentView.tsx` | MODIFY | Wrap in `RichContentBlock` with overlay support |
| `src/client/components/ui/dialog.tsx` | MODIFY | Add `xl` size variant |
| `tsconfig.json` | MODIFY | Add new files to `include` array |

---

### Task 1: Foundation — Types, Dialog xl, tsconfig

**Files:**
- Create: `src/client/components/rich-content/types.ts`
- Modify: `src/client/components/ui/dialog.tsx:27-31`
- Modify: `tsconfig.json:70` (add entries to include array)

- [ ] **Step 1: Create the types file**

```typescript
// src/client/components/rich-content/types.ts
export type RichContentType = "markdown" | "code" | "embed" | "diff"
```

- [ ] **Step 2: Add xl size to Dialog**

In `src/client/components/ui/dialog.tsx`, change the `sizeClasses` object and the type:

```typescript
// Before (line 27-31):
const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
}

// After:
const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-4xl",
}
```

Also update the `size` prop type on `DialogContent` (line 36):

```typescript
// Before:
    size?: "sm" | "md" | "lg"

// After:
    size?: "sm" | "md" | "lg" | "xl"
```

- [ ] **Step 3: Add new files to tsconfig.json include**

Append these entries to the `include` array in `tsconfig.json` (after line 70, before the closing `]`):

```json
    "src/client/components/rich-content/types.ts",
    "src/client/components/rich-content/ContentOverlay.tsx",
    "src/client/components/rich-content/RichContentBlock.tsx",
    "src/client/components/rich-content/EmbedRenderer.tsx",
    "src/client/components/rich-content/remarkRichContentHint.ts",
    "src/client/components/messages/FileContentView.tsx"
```

Note: `FileContentView.tsx` was missing from tsconfig include — it's imported by `ToolCallMessage.tsx` (which is included) so it compiles via Vite, but adding it ensures direct `tsc` checking.

- [ ] **Step 4: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/client/components/rich-content/types.ts src/client/components/ui/dialog.tsx tsconfig.json
git commit -m "feat: add rich content types, dialog xl size, tsconfig entries"
```

---

### Task 2: ContentOverlay Component

**Files:**
- Create: `src/client/components/rich-content/ContentOverlay.tsx`

The ContentOverlay wraps existing Dialog components to show content in a large, scrollable overlay. It has a copy button in the header.

- [ ] **Step 1: Write ContentOverlay**

```tsx
// src/client/components/rich-content/ContentOverlay.tsx
import { useCallback, useState, type ReactNode } from "react"
import { Code, FileText, GitCompareArrows, Image, Copy, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code,
  markdown: FileText,
  embed: Image,
  diff: GitCompareArrows,
}

interface ContentOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  type: RichContentType
  children: ReactNode
  rawContent?: string
}

export function ContentOverlay({
  open,
  onOpenChange,
  title,
  type,
  children,
  rawContent,
}: ContentOverlayProps) {
  const [copied, setCopied] = useState(false)
  const Icon = typeIcons[type]

  const handleCopy = useCallback(async () => {
    if (!rawContent) return
    await navigator.clipboard.writeText(rawContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [rawContent])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="truncate text-sm">
              {title ?? type}
            </DialogTitle>
            {rawContent ? (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "ml-auto h-7 w-7 shrink-0 text-muted-foreground",
                  !copied && "hover:text-foreground",
                  copied && "hover:!bg-transparent"
                )}
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/rich-content/ContentOverlay.tsx
git commit -m "feat: add ContentOverlay dialog for immersive content viewing"
```

---

### Task 3: RichContentBlock Component

**Files:**
- Create: `src/client/components/rich-content/RichContentBlock.test.ts`
- Create: `src/client/components/rich-content/RichContentBlock.tsx`

This is the core wrapper. It wraps any content in a collapsible card with a header (icon + title + expand toggle + overlay button). Collapsed state shows a max-height preview with fade-out gradient.

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/components/rich-content/RichContentBlock.test.ts
import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { RichContentBlock } from "./RichContentBlock"

describe("RichContentBlock", () => {
  test("renders children inside wrapper", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="TypeScript">
        <pre><code>const x = 1</code></pre>
      </RichContentBlock>
    )

    expect(html).toContain("const x = 1")
    expect(html).toContain("TypeScript")
  })

  test("renders collapsed by default (defaultExpanded=false)", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code">
        <pre><code>line1</code></pre>
      </RichContentBlock>
    )

    // Collapsed: content should be wrapped in max-height container with overflow hidden
    expect(html).toContain("max-h-")
    expect(html).toContain("overflow-hidden")
  })

  test("renders expanded when defaultExpanded is true", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code" defaultExpanded>
        <pre><code>line1</code></pre>
      </RichContentBlock>
    )

    // Expanded: no max-height restriction
    expect(html).not.toContain("max-h-")
  })

  test("shows correct icon for each content type", () => {
    const codeHtml = renderToStaticMarkup(
      <RichContentBlock type="code"><pre>x</pre></RichContentBlock>
    )
    // Code icon is an SVG, just check the wrapper renders
    expect(codeHtml).toContain("<svg")

    const markdownHtml = renderToStaticMarkup(
      <RichContentBlock type="markdown"><p>text</p></RichContentBlock>
    )
    expect(markdownHtml).toContain("<svg")
  })

  test("renders overlay trigger button", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code">
        <pre>x</pre>
      </RichContentBlock>
    )

    expect(html).toContain("aria-label")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/RichContentBlock.test.ts`
Expected: FAIL — module `./RichContentBlock` not found

- [ ] **Step 3: Implement RichContentBlock**

```tsx
// src/client/components/rich-content/RichContentBlock.tsx
import { memo, useState, type ReactNode } from "react"
import {
  Code,
  FileText,
  GitCompareArrows,
  Image,
  ChevronRight,
  Maximize2,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { ContentOverlay } from "./ContentOverlay"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code,
  markdown: FileText,
  embed: Image,
  diff: GitCompareArrows,
}

const COLLAPSED_MAX_HEIGHT = "max-h-24"

interface RichContentBlockProps {
  type: RichContentType
  title?: string
  defaultExpanded?: boolean
  children: ReactNode
  rawContent?: string
}

export const RichContentBlock = memo(function RichContentBlock({
  type,
  title,
  defaultExpanded = false,
  children,
  rawContent,
}: RichContentBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const Icon = typeIcons[type]
  const displayTitle = title ?? type

  return (
    <div className="group/rich-content rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 border-b border-border text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-muted-foreground">
          {displayTitle}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label={expanded ? "Collapse content" : "Expand content"}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                expanded && "rotate-90"
              )}
            />
          </button>
          <button
            type="button"
            aria-label="Open in overlay"
            onClick={() => setOverlayOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative transition-[max-height] duration-200 ease-in-out",
          !expanded && `${COLLAPSED_MAX_HEIGHT} overflow-hidden`
        )}
      >
        {children}
        {!expanded && (
          <div
            className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

      <ContentOverlay
        open={overlayOpen}
        onOpenChange={setOverlayOpen}
        title={displayTitle}
        type={type}
        rawContent={rawContent}
      >
        {children}
      </ContentOverlay>
    </div>
  )
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/RichContentBlock.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/client/components/rich-content/RichContentBlock.tsx src/client/components/rich-content/RichContentBlock.test.ts
git commit -m "feat: add RichContentBlock with collapsible card and overlay trigger"
```

---

### Task 4: Code Block Integration (shared.tsx pre → RichContentBlock)

**Files:**
- Modify: `src/client/components/messages/shared.tsx:210,260-287`
- Modify: `src/client/components/messages/shared.test.tsx`

This task wraps all code blocks rendered by `react-markdown` in `RichContentBlock`. We add an `extractLanguageFromChildren` helper and modify the `pre` component override.

- [ ] **Step 1: Write the failing test**

Add these tests to `src/client/components/messages/shared.test.tsx`:

```typescript
// Add to existing imports:
import { extractLanguageFromChildren, extractText } from "./shared"

// Add new describe block:
describe("extractLanguageFromChildren", () => {
  test("returns language from code element className", () => {
    const children = <code className="language-typescript">const x = 1</code>
    expect(extractLanguageFromChildren(children)).toBe("typescript")
  })

  test("returns null for code element without language class", () => {
    const children = <code>plain code</code>
    expect(extractLanguageFromChildren(children)).toBeNull()
  })

  test("returns null for non-element children", () => {
    expect(extractLanguageFromChildren("text")).toBeNull()
  })
})

describe("extractText", () => {
  test("extracts text from string", () => {
    expect(extractText("hello")).toBe("hello")
  })

  test("extracts text from number", () => {
    expect(extractText(42)).toBe("42")
  })

  test("extracts text from nested elements", () => {
    expect(extractText(<span>hello <b>world</b></span>)).toBe("hello world")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/messages/shared.test.tsx`
Expected: FAIL — `extractLanguageFromChildren` is not exported, `extractText` is not exported

- [ ] **Step 3: Export extractText and add extractLanguageFromChildren**

In `src/client/components/messages/shared.tsx`:

1. Change `function extractText` (line 210) from private to exported:

```typescript
// Before (line 210):
function extractText(node: ReactNode): string {

// After:
export function extractText(node: ReactNode): string {
```

2. Add `extractLanguageFromChildren` function right after `extractText` (after line 225):

```typescript
export function extractLanguageFromChildren(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string }>(children)) return null
  const className = children.props.className
  if (typeof className !== "string") return null
  const match = className.match(/language-(\S+)/)
  return match ? match[1] : null
}
```

3. Modify the `pre` component (lines 260-287) to wrap in `RichContentBlock`:

```typescript
  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => {
    const textContent = extractText(children)
    const language = extractLanguageFromChildren(children)

    return (
      <RichContentBlock
        type="code"
        title={language ?? "Code"}
        rawContent={textContent}
        defaultExpanded
      >
        <div className="relative overflow-x-auto max-w-full min-w-0 no-code-highlight group/pre">
          <pre className="min-w-0 rounded-none py-2.5 px-3.5 [.no-pre-highlight_&]:bg-background" {...props}>{children}</pre>
        </div>
      </RichContentBlock>
    )
  },
```

Note: removed the copy button from the `pre` component — `RichContentBlock`'s overlay now provides copy. Also changed `rounded-xl` to `rounded-none` since the card border handles rounding.

4. Add import at top of `shared.tsx`:

```typescript
import { RichContentBlock } from "../rich-content/RichContentBlock"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/messages/shared.test.tsx`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/client/components/messages/shared.tsx src/client/components/messages/shared.test.tsx
git commit -m "feat: wrap markdown code blocks in RichContentBlock"
```

---

### Task 5: EmbedRenderer — Mermaid Diagrams

**Files:**
- Create: `src/client/components/rich-content/EmbedRenderer.tsx`
- Create: `src/client/components/rich-content/EmbedRenderer.test.ts`
- Modify: `src/client/components/messages/shared.tsx` (embed detection in `pre`)

Mermaid diagrams are rendered client-side by lazy-loading the `mermaid` package. D2 diagrams display a "D2 not supported client-side" placeholder with raw source. Images render as `<img>` tags.

- [ ] **Step 1: Install mermaid**

Run: `bun add mermaid`

- [ ] **Step 2: Write the failing test**

```typescript
// src/client/components/rich-content/EmbedRenderer.test.ts
import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { EmbedRenderer, isEmbedLanguage } from "./EmbedRenderer"

describe("isEmbedLanguage", () => {
  test("returns true for mermaid", () => {
    expect(isEmbedLanguage("mermaid")).toBe(true)
  })

  test("returns true for d2", () => {
    expect(isEmbedLanguage("d2")).toBe(true)
  })

  test("returns false for typescript", () => {
    expect(isEmbedLanguage("typescript")).toBe(false)
  })

  test("returns false for null", () => {
    expect(isEmbedLanguage(null)).toBe(false)
  })
})

describe("EmbedRenderer", () => {
  test("renders mermaid container with source as data attribute", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="mermaid" source="graph TD\n  A --> B" />
    )

    // Should render a container div (mermaid renders client-side via useEffect)
    expect(html).toContain("data-mermaid-source")
  })

  test("renders d2 fallback with raw source", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="d2" source="x -> y" />
    )

    expect(html).toContain("x -&gt; y") // HTML-encoded
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/EmbedRenderer.test.ts`
Expected: FAIL — module `./EmbedRenderer` not found

- [ ] **Step 4: Implement EmbedRenderer**

```tsx
// src/client/components/rich-content/EmbedRenderer.tsx
import { memo, useEffect, useRef, useState } from "react"

const EMBED_LANGUAGES = new Set(["mermaid", "d2"])

export function isEmbedLanguage(language: string | null): boolean {
  if (language === null) return false
  return EMBED_LANGUAGES.has(language)
}

interface EmbedRendererProps {
  format: string
  source: string
}

export const EmbedRenderer = memo(function EmbedRenderer({
  format,
  source,
}: EmbedRendererProps) {
  if (format === "mermaid") {
    return <MermaidDiagram source={source} />
  }

  // D2 and other formats: show source as fallback
  return (
    <div className="p-3 text-xs font-mono">
      <div className="mb-2 text-muted-foreground text-[10px] uppercase tracking-wider">
        {format} diagram (source)
      </div>
      <pre className="whitespace-pre-wrap break-all text-foreground">
        {source}
      </pre>
    </div>
  )
})

function MermaidDiagram({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const container = containerRef.current
      if (!container) return

      try {
        const mermaid = await import("mermaid")
        mermaid.default.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
        })

        const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`
        const { svg } = await mermaid.default.render(id, source)
        if (!cancelled && container) {
          container.innerHTML = svg
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void render()
    return () => { cancelled = true }
  }, [source])

  if (error) {
    return (
      <div className="p-3">
        <div className="mb-1 text-xs text-destructive">Diagram render error</div>
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
          {source}
        </pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-mermaid-source={source}
      className="flex items-center justify-center p-3 min-h-[60px] [&_svg]:max-w-full"
    />
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/EmbedRenderer.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Integrate embed detection into shared.tsx pre**

In `src/client/components/messages/shared.tsx`, update the `pre` component to detect embed languages:

1. Add import:

```typescript
import { EmbedRenderer, isEmbedLanguage } from "../rich-content/EmbedRenderer"
```

2. Update the `pre` component:

```typescript
  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => {
    const textContent = extractText(children)
    const language = extractLanguageFromChildren(children)
    const isEmbed = isEmbedLanguage(language)

    return (
      <RichContentBlock
        type={isEmbed ? "embed" : "code"}
        title={language ?? "Code"}
        rawContent={textContent}
        defaultExpanded
      >
        {isEmbed && language ? (
          <EmbedRenderer format={language} source={textContent} />
        ) : (
          <div className="relative overflow-x-auto max-w-full min-w-0 no-code-highlight group/pre">
            <pre className="min-w-0 rounded-none py-2.5 px-3.5 [.no-pre-highlight_&]:bg-background" {...props}>{children}</pre>
          </div>
        )}
      </RichContentBlock>
    )
  },
```

- [ ] **Step 7: Run all tests**

Run: `bun test src/client/components/rich-content/ src/client/components/messages/shared.test.tsx`
Expected: All PASS

- [ ] **Step 8: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/client/components/rich-content/EmbedRenderer.tsx src/client/components/rich-content/EmbedRenderer.test.ts src/client/components/messages/shared.tsx
git commit -m "feat: add EmbedRenderer with mermaid support, detect embeds in pre"
```

---

### Task 6: FileContentView Integration

**Files:**
- Modify: `src/client/components/messages/FileContentView.tsx`
- Modify: `src/client/components/messages/FileContentView.test.ts`

Wrap `FileContentView` output in `RichContentBlock` so diffs and file content get collapse/overlay support.

- [ ] **Step 1: Write the failing test**

Add to `src/client/components/messages/FileContentView.test.ts`:

```typescript
import { renderToStaticMarkup } from "react-dom/server"
import { FileContentView } from "./FileContentView"

describe("FileContentView with RichContentBlock", () => {
  test("diff view renders inside RichContentBlock", () => {
    const html = renderToStaticMarkup(
      <FileContentView
        content=""
        isDiff
        oldString="old"
        newString="new"
      />
    )

    // Should have the RichContentBlock wrapper
    expect(html).toContain("group/rich-content")
    // Should still render the diff
    expect(html).toContain("old")
    expect(html).toContain("new")
  })

  test("text view renders inside RichContentBlock", () => {
    const html = renderToStaticMarkup(
      <FileContentView content="     1→const x = 1" />
    )

    expect(html).toContain("group/rich-content")
    expect(html).toContain("const x = 1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/messages/FileContentView.test.ts`
Expected: FAIL — html doesn't contain "group/rich-content"

- [ ] **Step 3: Wrap FileContentView in RichContentBlock**

In `src/client/components/messages/FileContentView.tsx`:

1. Add imports:

```typescript
import { RichContentBlock } from "../rich-content/RichContentBlock"
```

2. Add `filePath` to the props interface:

```typescript
interface FileContentViewProps {
  content: string
  isDiff?: boolean
  oldString?: string
  newString?: string
  filePath?: string
}
```

3. Update the component signature to accept `filePath`:

```typescript
export const FileContentView = memo(function FileContentView({ content, isDiff = false, oldString, newString, filePath }: FileContentViewProps) {
```

4. Wrap the diff rendering return (lines 93-130) in RichContentBlock:

```typescript
  if (isDiff && diffLines.length > 0) {
    return (
      <RichContentBlock type="diff" title={filePath ?? "Diff"} defaultExpanded>
        <div className="my-1 overflow-hidden">
          {/* ... existing diff table (unchanged) ... */}
        </div>
      </RichContentBlock>
    )
  }
```

5. Wrap the text rendering return (lines 133-154):

```typescript
  return (
    <RichContentBlock type="code" title={filePath ?? "File"} defaultExpanded>
      <div className="my-1 overflow-hidden">
        {/* ... existing text table (unchanged) ... */}
      </div>
    </RichContentBlock>
  )
```

Note: Remove the outer `rounded-lg border border-border` from both `<div>` wrappers since `RichContentBlock` provides the border. Keep `overflow-hidden`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/messages/FileContentView.test.ts`
Expected: All tests PASS (existing computeUnifiedDiff tests + new RichContentBlock tests)

- [ ] **Step 5: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors (check that `ToolCallMessage.tsx` still compiles — `filePath` is optional so existing callers are unaffected)

- [ ] **Step 6: Commit**

```bash
git add src/client/components/messages/FileContentView.tsx src/client/components/messages/FileContentView.test.ts
git commit -m "feat: wrap FileContentView in RichContentBlock for collapse/overlay"
```

---

### Task 7: TextMessage Integration — Long Markdown Collapsible

**Files:**
- Modify: `src/client/components/messages/TextMessage.tsx`

Long text messages (>800 chars) get wrapped in `RichContentBlock` with `type="markdown"` and start expanded. Short messages render unchanged.

- [ ] **Step 1: Modify TextMessage**

```tsx
// src/client/components/messages/TextMessage.tsx
import { memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ProcessedTextMessage } from "./types"
import { createMarkdownComponents } from "./shared"
import { RichContentBlock } from "../rich-content/RichContentBlock"

const LONG_MESSAGE_THRESHOLD = 800

interface Props {
  message: ProcessedTextMessage
}

export const TextMessage = memo(function TextMessage({ message }: Props) {
  const isLong = message.text.length > LONG_MESSAGE_THRESHOLD

  const content = (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      <Markdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents()}>
        {message.text}
      </Markdown>
    </div>
  )

  if (isLong) {
    return (
      <RichContentBlock
        type="markdown"
        title="Response"
        defaultExpanded
        rawContent={message.text}
      >
        {content}
      </RichContentBlock>
    )
  }

  return content
})
```

- [ ] **Step 2: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `bun test src/client/components/`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/client/components/messages/TextMessage.tsx
git commit -m "feat: wrap long text messages in collapsible RichContentBlock"
```

---

### Task 8: remarkRichContentHint Plugin — Agent Auto-Expand

**Files:**
- Create: `src/client/components/rich-content/remarkRichContentHint.ts`
- Create: `src/client/components/rich-content/remarkRichContentHint.test.ts`
- Modify: `src/client/components/messages/TextMessage.tsx` (add plugin to remarkPlugins)
- Modify: `src/client/components/messages/shared.tsx` (read autoExpand data attribute)
- Modify: `src/client/components/rich-content/RichContentBlock.tsx` (accept data-auto-expand)

This remark plugin detects `<!-- richcontent: autoExpand -->` HTML comments in the mdast tree and annotates the next sibling node with `data-auto-expand="true"`. The `pre` component reads this and passes `defaultExpanded={true}` to `RichContentBlock`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/client/components/rich-content/remarkRichContentHint.test.ts
import { describe, test, expect } from "bun:test"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import { remarkRichContentHint } from "./remarkRichContentHint"

async function process(markdown: string) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRichContentHint)
    .use(remarkStringify)
    .process(markdown)
  return result
}

describe("remarkRichContentHint", () => {
  test("annotates code block after autoExpand comment", async () => {
    const md = `<!-- richcontent: autoExpand -->\n\n\`\`\`typescript\nconst x = 1\n\`\`\``
    const result = await process(md)
    const tree = unified().use(remarkParse).use(remarkRichContentHint).parse(String(result))
    // The plugin modifies the AST — we test by checking data attributes survive
    // Since remark-stringify won't preserve data, we test the tree directly
    const parsed = unified().use(remarkParse).parse(md)
    unified().use(remarkRichContentHint).runSync(parsed)

    // Find the code node
    const codeNode = parsed.children.find(
      (n: { type: string }) => n.type === "code"
    ) as { type: string; data?: { hProperties?: { "data-auto-expand"?: string } } } | undefined

    expect(codeNode).toBeDefined()
    expect(codeNode?.data?.hProperties?.["data-auto-expand"]).toBe("true")
  })

  test("does not annotate when comment is absent", async () => {
    const md = "```typescript\nconst x = 1\n```"
    const parsed = unified().use(remarkParse).parse(md)
    unified().use(remarkRichContentHint).runSync(parsed)

    const codeNode = parsed.children.find(
      (n: { type: string }) => n.type === "code"
    ) as { type: string; data?: { hProperties?: Record<string, string> } } | undefined

    expect(codeNode?.data?.hProperties?.["data-auto-expand"]).toBeUndefined()
  })

  test("removes the comment node from the tree", async () => {
    const md = `<!-- richcontent: autoExpand -->\n\n\`\`\`typescript\nconst x = 1\n\`\`\``
    const parsed = unified().use(remarkParse).parse(md)
    unified().use(remarkRichContentHint).runSync(parsed)

    const htmlNodes = parsed.children.filter(
      (n: { type: string }) => n.type === "html"
    )
    expect(htmlNodes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Install remark dependencies for the plugin**

Run: `bun add unified remark-parse remark-stringify`

Note: `react-markdown` already uses remark internally, but the test needs standalone remark for unit testing the plugin.

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/remarkRichContentHint.test.ts`
Expected: FAIL — module `./remarkRichContentHint` not found

- [ ] **Step 4: Implement remarkRichContentHint**

```typescript
// src/client/components/rich-content/remarkRichContentHint.ts
import type { Root, RootContent } from "mdast"

const HINT_PATTERN = /<!--\s*richcontent:\s*autoExpand\s*-->/

interface NodeWithData extends RootContent {
  data?: {
    hProperties?: Record<string, string>
  }
}

export function remarkRichContentHint() {
  return function transform(tree: Root) {
    const indicesToRemove: number[] = []

    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i]
      if (node.type !== "html") continue

      const htmlNode = node as { type: "html"; value: string }
      if (!HINT_PATTERN.test(htmlNode.value)) continue

      // Find next sibling that isn't another html comment
      const nextIndex = i + 1
      if (nextIndex < tree.children.length) {
        const next = tree.children[nextIndex] as NodeWithData
        next.data = next.data ?? {}
        next.data.hProperties = next.data.hProperties ?? {}
        next.data.hProperties["data-auto-expand"] = "true"
      }

      indicesToRemove.push(i)
    }

    // Remove comment nodes in reverse order to preserve indices
    for (let j = indicesToRemove.length - 1; j >= 0; j--) {
      tree.children.splice(indicesToRemove[j], 1)
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/remarkRichContentHint.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Wire plugin into TextMessage**

In `src/client/components/messages/TextMessage.tsx`, add the plugin:

```typescript
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"

// Change the Markdown remarkPlugins:
<Markdown remarkPlugins={[remarkGfm, remarkRichContentHint]} components={createMarkdownComponents()}>
```

- [ ] **Step 7: Read data-auto-expand in shared.tsx pre component**

In `src/client/components/messages/shared.tsx`, update the `pre` component to check for the data attribute:

```typescript
  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => {
    const textContent = extractText(children)
    const language = extractLanguageFromChildren(children)
    const isEmbed = isEmbedLanguage(language)
    const autoExpand = props["data-auto-expand"] === "true"

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
          <div className="relative overflow-x-auto max-w-full min-w-0 no-code-highlight group/pre">
            <pre className="min-w-0 rounded-none py-2.5 px-3.5 [.no-pre-highlight_&]:bg-background" {...props}>{children}</pre>
          </div>
        )}
      </RichContentBlock>
    )
  },
```

Note: The `data-auto-expand` attribute is set by the remark plugin on the `code` mdast node, which `react-markdown` passes through to the `pre` HTML element as a data attribute via `hProperties`.

- [ ] **Step 8: Run all tests**

Run: `bun test src/client/components/`
Expected: All PASS

- [ ] **Step 9: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/client/components/rich-content/remarkRichContentHint.ts src/client/components/rich-content/remarkRichContentHint.test.ts src/client/components/messages/TextMessage.tsx src/client/components/messages/shared.tsx
git commit -m "feat: add remarkRichContentHint plugin for agent auto-expand"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 2: Full typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 3: Build check**

Run: `bun run check`
Expected: Clean build

- [ ] **Step 4: Smoke test**

Run: `bun run dev`

Manual verification:
1. Open a chat, send a message that triggers code output → code blocks should appear in collapsible RichContentBlock cards
2. Click the expand/collapse chevron → content toggles
3. Click the overlay button (Maximize2 icon) → Dialog opens with full content
4. Close the overlay → returns to transcript
5. Long text messages (>800 chars) → wrapped in RichContentBlock
6. Mermaid code block → renders as SVG diagram inline
7. File edit diffs → wrapped in RichContentBlock with overlay support

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final adjustments after smoke test"
```
