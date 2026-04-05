# Mobile Content Viewer Design

**Date:** 2026-04-05
**ADR:** adr-20260405-mobile-content-viewer
**Status:** Proposed

## Problem

`ContentOverlay` uses a Radix Dialog (`max-w-4xl`, `max-h-[85vh]`, centered with rounded corners) to preview rich content (code, diff, markdown, embeds). On mobile, this wastes screen real estate with margins and chrome. The close X has a tiny touch target. There is no mobile-specific UX.

## Decision

**Approach A (Dual-mode ContentOverlay)** — keep Radix Dialog as the modal primitive for both desktop and mobile. Mobile fullscreen is achieved via responsive CSS class overrides on `DialogContent`, not a separate component. This preserves focus trap, a11y, portal semantics, and the chat-input focus restore on close without reimplementation.

A `ContentViewerContext` provides shared state between a contextual toolbar and content renderers, enabling type-specific controls without changing the consumer prop interface.

## Architecture

```
ContentOverlay (responsive Radix Dialog)
  ContentViewerContext.Provider
    DialogHeader (close + title + copy)
    ViewerToolbar (type-specific controls, md:hidden on desktop)
    DialogBody (children consume context for viewer state)
```

### Viewport Branching

`useIsMobile()` hook drives CSS class selection on `DialogContent`:

- **Desktop (>=768px):** Current classes — centered, `max-w-4xl`, `max-h-[85vh]`, rounded corners, fade+zoom animation
- **Mobile (<768px):** `inset-0 max-w-none max-h-none rounded-none translate-x-0 translate-y-0` + slide-up animation

No conditional component rendering. The same React tree renders in both modes. Viewport changes during an open overlay trigger a re-render (class swap), not a remount.

### ContentViewerContext

Discriminated union of viewer state per content type. Provided by `ContentOverlay`. When context is `null` (inline view outside overlay), renderers fall back to local state.

| Type | State Fields | Actions |
|---|---|---|
| `code` | `lineNumbers: boolean` | `TOGGLE_LINE_NUMBERS` |
| `diff` | `viewMode: "unified" \| "split"` | `TOGGLE_VIEW_MODE` |
| `embed` | `renderMode: "render" \| "source"`, `zoom: number` | `SET_RENDER_MODE`, `ZOOM_IN`, `ZOOM_OUT`, `ZOOM_RESET` |
| `markdown` | `tocOpen: boolean`, `headings: Heading[]` | `TOGGLE_TOC`, `REGISTER_HEADINGS` |

### ViewerToolbar

Renders controls based on content type. Uses segmented button style matching existing SVG render/source toggle aesthetic in `EmbedRenderer`.

| Type | Controls |
|---|---|
| `code` | `[ Ln # ]` line numbers toggle |
| `diff` | `[ Unified \| Split ]` view mode toggle |
| `embed` | `[ Render \| Source ]` mode + `[ - zoom + ]` zoom controls |
| `markdown` | `[ TOC ]` table of contents toggle |

On desktop: hidden via `md:hidden` (dialog has enough space for inline controls).
On mobile: always visible, sticky below the header.

### Renderer Contract

Renderers opt-in to the viewer context:

```tsx
const viewer = useContentViewer()
// null when inline, populated when inside overlay
const lineNumbers = viewer?.type === "code" ? viewer.lineNumbers : false
const showInlineControls = !viewer // hide inline controls when toolbar owns them
```

Pattern: check context existence. If present, use shared state and hide inline controls. If absent, use local state and show inline controls.

## File Changes

### New Files

| File | Purpose |
|---|---|
| `src/client/lib/useIsMobile.ts` | Shared hook: `matchMedia("(max-width: 767px)")`, reactive, SSR-safe |
| `src/client/components/rich-content/ContentViewerContext.ts` | Context definition, state types, reducer, `useContentViewer()` hook |
| `src/client/components/rich-content/ViewerToolbar.tsx` | Contextual controls bar per content type |

### Modified Files

| File | Change |
|---|---|
| `ContentOverlay.tsx` | Wrap children in `ContentViewerContext.Provider`, add `useIsMobile()` for responsive classes, render `ViewerToolbar` between header and body |
| `EmbedRenderer.tsx` | `SvgEmbed` consumes `ContentViewerContext` for render/source mode when in overlay; hides inline toggle when context exists |
| `dialog.tsx` | Add responsive fullscreen CSS variant classes to `DialogContent` size map (new `"fullscreen"` size option used by `ContentOverlay` on mobile) |

### Unchanged Files

| File | Why |
|---|---|
| `RichContentBlock.tsx` | Still passes same props to `ContentOverlay` |
| `TextMessage.tsx`, `FileContentView.tsx`, `PresentContentMessage.tsx`, `shared.tsx` | Consumer prop interface unchanged |

## Animation

- **Mobile entry:** `translate-y-full -> translate-y-0`, `duration-300 ease-out` (Tailwind `animate-in slide-in-from-bottom`)
- **Mobile exit:** `translate-y-0 -> translate-y-full`, `duration-200 ease-in`
- **Desktop:** Current Radix fade+zoom unchanged
- Applied via responsive animation classes on `DialogContent`

## Safe Area

- Toolbar: `pt-[env(safe-area-inset-top)]` for notch devices
- Content bottom: `pb-[env(safe-area-inset-bottom)]` for home indicator
- Existing `index.css` has bottom inset utility; top inset needs adding

## Embed Zoom

- CSS `transform: scale()` on the embed container
- Toolbar: zoom-in (+), zoom-out (-), fit-to-width (reset to scale 1)
- Pinch-to-zoom: `touch-action: pinch-zoom` on content area
- Zoom state in `ContentViewerContext` (`zoom: number`, default 1)
- Works uniformly: container transform scales all embed types (Mermaid SVG, `<img>` SVG, `<pre>` source)

## Markdown TOC

- Auto-extracted from rendered heading elements (`h1`-`h3`) after markdown renders
- Registered into context via `REGISTER_HEADINGS` action
- Renders as a slide-in panel or dropdown from the TOC toolbar button
- Tapping a heading smooth-scrolls to it in the content area

## Testing Strategy (TDD)

### Unit Tests

1. **`useIsMobile` hook** — returns correct value for different viewport widths, updates on resize
2. **`ContentViewerContext` reducer** — all actions produce correct state transitions for each content type
3. **`ViewerToolbar`** — renders correct controls per content type, dispatches correct actions
4. **`ContentOverlay`** — responsive class switching based on `useIsMobile()`, context provision

### Integration Tests

5. **Renderer context consumption** — `EmbedRenderer` uses context state when available, falls back to local state when not
6. **Toolbar-renderer coordination** — toggling a toolbar control updates the rendered content (e.g., line numbers toggle changes code display)

### Visual/Smoke Tests

7. **Mobile fullscreen** — overlay fills viewport edge-to-edge on mobile viewport
8. **Desktop unchanged** — overlay renders as centered dialog on desktop viewport
9. **Animation** — slide-up entry, slide-down exit on mobile
10. **Safe area** — toolbar respects top inset, content respects bottom inset

## Constraints

- `rule-rule-strict-typescript` — strict typing, no `any`
- `rule-react-no-effects` — minimize Effects; use event handlers and derived state where possible
- `rule-error-extraction` — safe error extraction in all catch blocks
- `ref-ref-radix-primitives` — stay on Radix Dialog, don't bypass its primitives
- `ref-ref-zustand-stores` — viewer state is ephemeral (context, not store) since it resets per overlay open
