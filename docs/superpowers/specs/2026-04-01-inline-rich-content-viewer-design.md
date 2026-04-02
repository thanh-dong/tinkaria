# Inline Rich Content Viewer

**ADR**: `adr-20260401-inline-rich-content-viewer`
**Supersedes**: `stateless-hopping-crayon.md` (diff-only sidebar plan — diffs now become one content type in this unified system)

## Summary

Enhance the chat transcript to support collapsible, expandable rich content blocks — markdown, syntax-highlighted code, embeds (diagrams/images/iframes), and diffs. Content renders inline with two display modes always available: **inline card** (collapsible preview) and **overlay panel** (immersive full-screen via Dialog). The right sidebar remains reserved for out-of-band content (session diffs).

## Requirements

| # | Requirement | Source |
|---|-------------|--------|
| R1 | All code blocks, markdown sections, embeds, and diffs can be expanded/collapsed inline | User |
| R2 | All content can be opened in an overlay panel (Dialog) for immersive viewing | User |
| R3 | Both inline and overlay modes are always available — user chooses | User |
| R4 | Agent (Claude) can auto-expand content when review is needed | User |
| R5 | Client-side pattern detection — no server changes, no new tool calls | Design decision |
| R6 | Right sidebar remains for out-of-band content (session diffs) | User pivot |

## Architecture

### Content Model

```typescript
type RichContentType = "markdown" | "code" | "embed" | "diff"

interface RichContentPayload {
  type: RichContentType
  content: string           // raw content
  title?: string            // header label
  language?: string         // for code blocks
  filePath?: string         // for code/diff context
  embedFormat?: "mermaid" | "d2" | "image" | "iframe"
  oldString?: string        // for diffs
  newString?: string        // for diffs
  autoExpand?: boolean      // agent hint
}
```

### Detection Strategy (Client-Side)

Content is detected and wrapped at the markdown renderer level — no changes to the message data model.

| Source | Detection | Content Type |
|--------|-----------|-------------|
| `pre > code` with `className="language-*"` | Language class on code element | `code` |
| `pre > code` with `language-mermaid` or `language-d2` | Specific language class | `embed` (diagram) |
| `img` tags in markdown | Image elements | `embed` (image) |
| `FileContentView` with `isDiff=true` | Existing diff rendering | `diff` |
| `FileContentView` with content | Existing file content | `code` |
| Long `TextMessage` content | Character count threshold for "show more" | `markdown` |

### Agent Hint Protocol

Claude can signal auto-expand by including an HTML comment before the content:

```markdown
<!-- richcontent: autoExpand -->
```

A custom remark plugin (`remarkRichContentHint`) detects this comment node in the AST and sets `autoExpand: true` on the next sibling content block. Note: `react-markdown` strips HTML comments by default — this plugin must operate at the remark (mdast) level, not rehype, by matching `html` nodes with the comment pattern. If the comment is malformed or absent, content renders normally (collapsed by default). Graceful degradation — never breaks rendering.

## Component Design

### New Components

#### `src/client/components/rich-content/RichContentBlock.tsx`

Wrapper component. Wraps any content in a collapsible card with overlay trigger.

```typescript
interface RichContentBlockProps {
  type: RichContentType
  title?: string
  defaultExpanded?: boolean    // from autoExpand hint or user action
  children: ReactNode          // the actual rendered content
  rawContent?: string          // for copy-to-clipboard in overlay
}
```

**Inline card structure:**
```
┌─────────────────────────────────────────────┐
│ [icon] Title/Label        [expand] [overlay]│  <- header
│─────────────────────────────────────────────│
│ (collapsed: 3-line preview with fade)       │  <- or full content when expanded
│ (expanded: full rendered content)           │
└─────────────────────────────────────────────┘
```

- `[expand]` — toggles between collapsed preview and full inline content
- `[overlay]` — opens content in Dialog overlay
- Icon derived from content type (Code, FileText, Image, GitDiff)
- Title auto-derived: language for code, filename for diffs, "Preview" for embeds

#### `src/client/components/rich-content/ContentOverlay.tsx`

Dialog-based overlay for immersive content viewing. Reuses existing `Dialog` from `c3-104`.

```typescript
interface ContentOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  type: RichContentType
  children: ReactNode
  rawContent?: string    // for copy button
}
```

**Overlay structure:**
```
┌─ Dialog ─────────────────────────────────────┐
│ [icon] Title                    [copy] [X]   │
│──────────────────────────────────────────────│
│                                              │
│  Full rendered content                       │
│  (more width + height than inline)           │
│                                              │
│  Scrollable                                  │
│                                              │
└──────────────────────────────────────────────┘
```

Uses `DialogContent` with a new `xl` size variant (wider than existing `lg` — e.g., `max-w-4xl`).

#### `src/client/components/rich-content/renderers/`

Content-type-specific renderers, shared between inline card and overlay:

| File | Purpose |
|------|---------|
| `CodeRenderer.tsx` | Syntax-highlighted code with line numbers. Uses existing `pre`/`code` styling + adds line numbers. |
| `EmbedRenderer.tsx` | Mermaid/D2 → SVG rendering, image display, sandboxed iframe. |

Note: `MarkdownRenderer` and `DiffRenderer` are not needed — inline card passes `children` directly (already rendered by existing `react-markdown` / `FileContentView`). Overlay re-renders the same children with more space.

### Modified Components

#### `src/client/components/messages/shared.tsx`

The `pre` component in `createMarkdownComponents()` gets wrapped in `RichContentBlock`:

```typescript
// Before:
pre: ({ children, ...props }) => (
  <div className="relative overflow-x-auto ...">
    <pre ...>{children}</pre>
    <Button variant="ghost" ...> {/* copy */} </Button>
  </div>
)

// After:
pre: ({ children, ...props }) => {
  const language = extractLanguageFromChildren(children)
  const isEmbed = language === "mermaid" || language === "d2"

  return (
    <RichContentBlock
      type={isEmbed ? "embed" : "code"}
      title={language ?? "Code"}
    >
      {isEmbed
        ? <EmbedRenderer format={language} source={extractText(children)} />
        : <pre ...>{children}</pre>
      }
    </RichContentBlock>
  )
}
```

#### `src/client/components/messages/FileContentView.tsx`

Add overlay button to existing diff/file views. Wrap the outer `<div>` with `RichContentBlock`:

```typescript
// Wrap the return with:
<RichContentBlock type={isDiff ? "diff" : "code"} title={filePath}>
  {/* existing table rendering */}
</RichContentBlock>
```

#### `src/client/components/messages/TextMessage.tsx`

For long text messages, wrap in `RichContentBlock` with `type="markdown"`:

```typescript
export const TextMessage = memo(function TextMessage({ message }: Props) {
  const isLong = message.text.length > 800  // threshold for collapsible

  const content = (
    <div className="text-pretty prose prose-sm ...">
      <Markdown ...>{message.text}</Markdown>
    </div>
  )

  if (isLong) {
    return (
      <RichContentBlock type="markdown" title="Response" defaultExpanded>
        {content}
      </RichContentBlock>
    )
  }

  return content
})
```

#### `src/client/components/ui/dialog.tsx`

Add `xl` size variant:

```typescript
const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-4xl",  // new
}
```

### No Changes

| Component | Why |
|-----------|-----|
| `c3-110` (chat/ChatPage) | Content flows through existing KannaTranscript → message renderers |
| `c3-115` (right-sidebar) | Remains for session diffs (existing plan) |
| `c3-2` (server) | Pure client-side feature |
| `c3-204` (shared-types) | No data model changes |

## Agent Integration (System Prompt)

A section added to the Kanna system prompt instructing Claude when to use the `<!-- richcontent: autoExpand -->` hint:

```
When presenting content that requires user review — design specs, generated code,
configuration files, or architectural diagrams — include the HTML comment
`<!-- richcontent: autoExpand -->` on the line before the content block.
This causes the content to render expanded inline for immediate review.

Example:
<!-- richcontent: autoExpand -->
```typescript
// generated code here
```
```

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Detection approach | Client-side pattern matching on markdown AST | Deterministic, no server changes, graceful degradation |
| Agent hint format | HTML comment `<!-- richcontent: autoExpand -->` | Hard to mess up, invisible if not parsed, one-line |
| Overlay implementation | Reuse existing Dialog primitive | Already in c3-104, Radix-based, accessible |
| Inline collapse preview | 3-line fade preview | Enough to identify content without scrolling past |
| Where to wrap | At markdown component level (shared.tsx pre/code) | Catches all code/embed content from any message type |
| Markdown collapsible threshold | 800 chars | Balances readability vs scroll fatigue |
| Right sidebar scope | Out-of-band only (session diffs) | User's explicit pivot from original brainstorm |

## Test Plan

### Unit Tests

| Test file | What |
|-----------|------|
| `src/client/components/rich-content/RichContentBlock.test.ts` | Collapse/expand toggle, overlay open/close, autoExpand initial state |
| `src/client/components/rich-content/renderers/EmbedRenderer.test.ts` | Mermaid/D2 source → SVG render, image src handling, iframe sandboxing |
| `src/client/components/messages/shared.test.ts` | `pre` component wraps in RichContentBlock, language detection, embed detection |
| `src/client/components/messages/FileContentView.test.ts` | Overlay button appears, RichContentBlock wrapper present |

### Integration / Smoke Tests

1. `bun run dev` → send a message with a long code block → verify:
   - Renders as collapsible inline card
   - Collapse/expand toggle works
   - "Open in overlay" opens Dialog with full content
   - Copy button works in both modes
2. Send a message with a mermaid code block → verify:
   - Detected as embed type
   - Rendered as SVG diagram inline
   - Overlay shows larger diagram
3. Send a message with `<!-- richcontent: autoExpand -->` before code → verify:
   - Content starts expanded
4. Trigger Edit tool call → verify FileContentView diff wraps in RichContentBlock
5. Long TextMessage → verify collapsible with "show more"

## File Manifest

| File | Action | Component |
|------|--------|-----------|
| `src/client/components/rich-content/RichContentBlock.tsx` | NEW | c3-111 |
| `src/client/components/rich-content/ContentOverlay.tsx` | NEW | c3-111 |
| `src/client/components/rich-content/renderers/CodeRenderer.tsx` | NEW | c3-111 |
| `src/client/components/rich-content/renderers/EmbedRenderer.tsx` | NEW | c3-111 |
| `src/client/components/rich-content/RichContentBlock.test.ts` | NEW | c3-111 |
| `src/client/components/rich-content/renderers/EmbedRenderer.test.ts` | NEW | c3-111 |
| `src/client/components/messages/shared.tsx` | MODIFY | c3-111 |
| `src/client/components/messages/shared.test.ts` | NEW | c3-111 |
| `src/client/components/messages/TextMessage.tsx` | MODIFY | c3-111 |
| `src/client/components/messages/FileContentView.tsx` | MODIFY | c3-111 |
| `src/client/components/messages/FileContentView.test.ts` | MODIFY | c3-111 |
| `src/client/components/ui/dialog.tsx` | MODIFY | c3-104 |

## Dependencies

### New Packages

| Package | Purpose |
|---------|---------|
| `mermaid` | Client-side Mermaid diagram rendering to SVG |
| `shiki` or `prism-react-renderer` | Syntax highlighting for CodeRenderer (evaluate during implementation) |

### Existing Packages (no changes)

- `react-markdown` + `remark-gfm` — markdown rendering
- `@radix-ui/react-dialog` — overlay panel
- `diff` — unified diff computation (FileContentView)
