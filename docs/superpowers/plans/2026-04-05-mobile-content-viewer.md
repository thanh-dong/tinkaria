# Mobile Content Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the centered Radix Dialog with a responsive fullscreen content viewer on mobile, with a contextual toolbar that provides type-specific controls (line numbers, diff mode, render/source + zoom, TOC).

**Architecture:** Keep Radix Dialog as the modal primitive for both desktop and mobile. Mobile fullscreen is achieved via responsive CSS class overrides on `DialogContent`. A `ContentViewerContext` provides shared state between a contextual toolbar and content renderers without changing any consumer prop interfaces. The `useIsMobile()` hook drives CSS class selection; viewport changes cause re-render (class swap), not remount.

**Tech Stack:** React 19, Radix Dialog, Tailwind CSS 4, Bun test, `matchMedia` API

**Spec:** `docs/superpowers/specs/2026-04-05-mobile-content-viewer-design.md`
**ADR:** `adr-20260405-mobile-content-viewer`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/client/hooks/useIsMobile.ts` | Create | Reactive `matchMedia` hook for `(max-width: 767px)` |
| `src/client/hooks/useIsMobile.test.ts` | Create | Unit tests for the hook |
| `src/client/components/rich-content/ContentViewerContext.ts` | Create | Context, discriminated state types, reducer, `useContentViewer()` hook |
| `src/client/components/rich-content/ContentViewerContext.test.ts` | Create | Reducer unit tests for all content types and actions |
| `src/client/components/rich-content/ViewerToolbar.tsx` | Create | Contextual controls bar per content type |
| `src/client/components/rich-content/ViewerToolbar.test.tsx` | Create | Renders correct controls per type, dispatches actions |
| `src/client/components/ui/dialog.tsx` | Modify | Add `"fullscreen"` size variant to `sizeClasses` + mobile animation overrides |
| `src/client/components/rich-content/ContentOverlay.tsx` | Modify | Wrap in `ContentViewerContext.Provider`, use `useIsMobile()` for size, render `ViewerToolbar` |
| `src/client/components/rich-content/ContentOverlay.test.tsx` | Modify | Add tests for context provision and mobile class selection |
| `src/client/components/rich-content/EmbedRenderer.tsx` | Modify | `SvgEmbed` consumes context for render/source mode, hides inline controls in overlay |
| `src/client/components/rich-content/EmbedRenderer.test.tsx` | Modify | Test context consumption fallback behavior |

---

### Task 1: `useIsMobile` Hook

**Files:**
- Create: `src/client/hooks/useIsMobile.ts`
- Create: `src/client/hooks/useIsMobile.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/client/hooks/useIsMobile.test.ts
import { describe, test, expect, afterEach } from "bun:test"
import { MOBILE_BREAKPOINT_QUERY, getIsMobile } from "./useIsMobile"

describe("useIsMobile", () => {
  test("exports the correct media query string", () => {
    expect(MOBILE_BREAKPOINT_QUERY).toBe("(max-width: 767px)")
  })

  test("getIsMobile returns false when matchMedia is unavailable", () => {
    const saved = globalThis.window
    // @ts-expect-error — deliberately removing window for SSR test
    globalThis.window = undefined
    expect(getIsMobile()).toBe(false)
    globalThis.window = saved
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/hooks/useIsMobile.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/client/hooks/useIsMobile.ts
import { useState, useEffect } from "react"

export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)"

export function getIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return isMobile
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/hooks/useIsMobile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/hooks/useIsMobile.ts src/client/hooks/useIsMobile.test.ts
git commit -m "feat: add useIsMobile hook with matchMedia 767px breakpoint"
```

---

### Task 2: `ContentViewerContext` — Types and Reducer

**Files:**
- Create: `src/client/components/rich-content/ContentViewerContext.ts`
- Create: `src/client/components/rich-content/ContentViewerContext.test.ts`

- [ ] **Step 1: Write failing tests for the reducer**

```ts
// src/client/components/rich-content/ContentViewerContext.test.ts
import { describe, test, expect } from "bun:test"
import {
  viewerReducer,
  createInitialState,
  type ViewerAction,
} from "./ContentViewerContext"

describe("ContentViewerContext reducer", () => {
  describe("code viewer", () => {
    test("creates initial state with lineNumbers false", () => {
      const state = createInitialState("code")
      expect(state).toEqual({ type: "code", lineNumbers: false })
    })

    test("TOGGLE_LINE_NUMBERS flips lineNumbers", () => {
      const state = createInitialState("code")
      const next = viewerReducer(state, { type: "TOGGLE_LINE_NUMBERS" })
      expect(next).toEqual({ type: "code", lineNumbers: true })

      const reverted = viewerReducer(next, { type: "TOGGLE_LINE_NUMBERS" })
      expect(reverted).toEqual({ type: "code", lineNumbers: false })
    })
  })

  describe("diff viewer", () => {
    test("creates initial state with unified mode", () => {
      const state = createInitialState("diff")
      expect(state).toEqual({ type: "diff", viewMode: "unified" })
    })

    test("TOGGLE_VIEW_MODE flips between unified and split", () => {
      const state = createInitialState("diff")
      const next = viewerReducer(state, { type: "TOGGLE_VIEW_MODE" })
      expect(next).toEqual({ type: "diff", viewMode: "split" })

      const reverted = viewerReducer(next, { type: "TOGGLE_VIEW_MODE" })
      expect(reverted).toEqual({ type: "diff", viewMode: "unified" })
    })
  })

  describe("embed viewer", () => {
    test("creates initial state with render mode and zoom 1", () => {
      const state = createInitialState("embed")
      expect(state).toEqual({ type: "embed", renderMode: "render", zoom: 1 })
    })

    test("SET_RENDER_MODE changes render mode", () => {
      const state = createInitialState("embed")
      const next = viewerReducer(state, { type: "SET_RENDER_MODE", payload: "source" })
      expect(next).toEqual({ type: "embed", renderMode: "source", zoom: 1 })
    })

    test("ZOOM_IN increases zoom by 0.25", () => {
      const state = createInitialState("embed")
      const next = viewerReducer(state, { type: "ZOOM_IN" })
      expect(next).toEqual({ type: "embed", renderMode: "render", zoom: 1.25 })
    })

    test("ZOOM_OUT decreases zoom by 0.25 with 0.25 floor", () => {
      const state = createInitialState("embed")
      const zoomed = viewerReducer(state, { type: "ZOOM_OUT" })
      expect(zoomed).toEqual({ type: "embed", renderMode: "render", zoom: 0.75 })

      const floor = viewerReducer(
        { type: "embed", renderMode: "render", zoom: 0.25 },
        { type: "ZOOM_OUT" },
      )
      expect(floor).toEqual({ type: "embed", renderMode: "render", zoom: 0.25 })
    })

    test("ZOOM_RESET sets zoom back to 1", () => {
      const state = { type: "embed" as const, renderMode: "render" as const, zoom: 2.5 }
      const next = viewerReducer(state, { type: "ZOOM_RESET" })
      expect(next).toEqual({ type: "embed", renderMode: "render", zoom: 1 })
    })
  })

  describe("markdown viewer", () => {
    test("creates initial state with tocOpen false and empty headings", () => {
      const state = createInitialState("markdown")
      expect(state).toEqual({ type: "markdown", tocOpen: false, headings: [] })
    })

    test("TOGGLE_TOC flips tocOpen", () => {
      const state = createInitialState("markdown")
      const next = viewerReducer(state, { type: "TOGGLE_TOC" })
      expect(next).toEqual({ type: "markdown", tocOpen: true, headings: [] })
    })

    test("REGISTER_HEADINGS sets headings array", () => {
      const state = createInitialState("markdown")
      const headings = [
        { level: 1, text: "Title", id: "title" },
        { level: 2, text: "Section", id: "section" },
      ]
      const next = viewerReducer(state, { type: "REGISTER_HEADINGS", payload: headings })
      expect(next).toEqual({ type: "markdown", tocOpen: false, headings })
    })
  })

  test("returns same state for unknown action on any viewer type", () => {
    const state = createInitialState("code")
    // @ts-expect-error — testing unknown action
    const next = viewerReducer(state, { type: "UNKNOWN_ACTION" })
    expect(next).toBe(state)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/ContentViewerContext.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// src/client/components/rich-content/ContentViewerContext.ts
import { createContext, useContext } from "react"
import type { RichContentType } from "./types"

// --- Heading type for markdown TOC ---

export interface TocHeading {
  level: number
  text: string
  id: string
}

// --- Discriminated union of viewer states ---

export type CodeViewerState = {
  type: "code"
  lineNumbers: boolean
}

export type DiffViewerState = {
  type: "diff"
  viewMode: "unified" | "split"
}

export type EmbedViewerState = {
  type: "embed"
  renderMode: "render" | "source"
  zoom: number
}

export type MarkdownViewerState = {
  type: "markdown"
  tocOpen: boolean
  headings: TocHeading[]
}

export type ViewerState =
  | CodeViewerState
  | DiffViewerState
  | EmbedViewerState
  | MarkdownViewerState

// --- Actions ---

export type ViewerAction =
  | { type: "TOGGLE_LINE_NUMBERS" }
  | { type: "TOGGLE_VIEW_MODE" }
  | { type: "SET_RENDER_MODE"; payload: "render" | "source" }
  | { type: "ZOOM_IN" }
  | { type: "ZOOM_OUT" }
  | { type: "ZOOM_RESET" }
  | { type: "TOGGLE_TOC" }
  | { type: "REGISTER_HEADINGS"; payload: TocHeading[] }

// --- Reducer ---

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.25

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (state.type) {
    case "code":
      if (action.type === "TOGGLE_LINE_NUMBERS") {
        return { ...state, lineNumbers: !state.lineNumbers }
      }
      return state

    case "diff":
      if (action.type === "TOGGLE_VIEW_MODE") {
        return { ...state, viewMode: state.viewMode === "unified" ? "split" : "unified" }
      }
      return state

    case "embed":
      switch (action.type) {
        case "SET_RENDER_MODE":
          return { ...state, renderMode: action.payload }
        case "ZOOM_IN":
          return { ...state, zoom: state.zoom + ZOOM_STEP }
        case "ZOOM_OUT":
          return { ...state, zoom: Math.max(ZOOM_MIN, state.zoom - ZOOM_STEP) }
        case "ZOOM_RESET":
          return { ...state, zoom: 1 }
        default:
          return state
      }

    case "markdown":
      switch (action.type) {
        case "TOGGLE_TOC":
          return { ...state, tocOpen: !state.tocOpen }
        case "REGISTER_HEADINGS":
          return { ...state, headings: action.payload }
        default:
          return state
      }
  }
}

// --- Factory ---

export function createInitialState(contentType: RichContentType): ViewerState {
  switch (contentType) {
    case "code":
      return { type: "code", lineNumbers: false }
    case "diff":
      return { type: "diff", viewMode: "unified" }
    case "embed":
      return { type: "embed", renderMode: "render", zoom: 1 }
    case "markdown":
      return { type: "markdown", tocOpen: false, headings: [] }
  }
}

// --- Context ---

export interface ContentViewerContextValue {
  state: ViewerState
  dispatch: (action: ViewerAction) => void
}

export const ContentViewerContext = createContext<ContentViewerContextValue | null>(null)

export function useContentViewer(): ContentViewerContextValue | null {
  return useContext(ContentViewerContext)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/ContentViewerContext.test.ts`
Expected: PASS — all 12 tests green

- [ ] **Step 5: Commit**

```bash
git add src/client/components/rich-content/ContentViewerContext.ts src/client/components/rich-content/ContentViewerContext.test.ts
git commit -m "feat: add ContentViewerContext with discriminated state types and reducer"
```

---

### Task 3: Dialog `"fullscreen"` Size Variant

**Files:**
- Modify: `src/client/components/ui/dialog.tsx` (lines 30-35, 53-55, 62)

- [ ] **Step 1: Write failing test**

There is no dedicated dialog test file in the project. The dialog is a UI primitive tested indirectly through consumers. We verify the change structurally: the `sizeClasses` map must include `"fullscreen"`.

Create a minimal assertion by adding to the existing `ContentOverlay.test.tsx` (since ContentOverlay is the consumer that will use `"fullscreen"`):

```ts
// Add to src/client/components/rich-content/ContentOverlay.test.tsx
import { describe, expect, test } from "bun:test"
import {
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  getContentOverlayUiIdentityProps,
  MOBILE_DIALOG_CLASSES,
} from "./ContentOverlay"
import { DIALOG_BODY_INSET_CLASS_NAME } from "../ui/dialog"

describe("ContentOverlay", () => {
  test("reuses the dialog body inset baseline for fullscreen content", () => {
    expect(CONTENT_OVERLAY_INNER_CLASS_NAME).toContain("px-4 pb-4")
    expect(CONTENT_OVERLAY_INNER_CLASS_NAME).toContain("pt-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("px-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("pb-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("pt-3.5")
  })

  test("tags the fullscreen rich-content viewer root so the overlay can grab it", () => {
    expect(CONTENT_OVERLAY_ROOT_UI_ID).toBe("rich-content.viewer.area")
    expect(getContentOverlayUiIdentityProps()).toEqual({
      "data-ui-id": "rich-content.viewer.area",
    })
  })

  test("mobile dialog classes include fullscreen inset and slide-up animation", () => {
    expect(MOBILE_DIALOG_CLASSES).toContain("inset-0")
    expect(MOBILE_DIALOG_CLASSES).toContain("max-w-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("max-h-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("rounded-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("translate-x-0")
    expect(MOBILE_DIALOG_CLASSES).toContain("translate-y-0")
    expect(MOBILE_DIALOG_CLASSES).toContain("slide-in-from-bottom")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/ContentOverlay.test.tsx`
Expected: FAIL — `MOBILE_DIALOG_CLASSES` is not exported

- [ ] **Step 3: Add fullscreen size variant to dialog.tsx**

In `src/client/components/ui/dialog.tsx`, update the `sizeClasses` map and the `DialogContent` type:

```ts
// dialog.tsx — update sizeClasses (line ~30)
const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-4xl",
  fullscreen: "inset-0 max-w-none max-h-none rounded-none border-0 translate-x-0 translate-y-0 left-0 top-0 shadow-none",
}

// dialog.tsx — update DialogContent type (line ~39)
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: "sm" | "md" | "lg" | "xl" | "fullscreen"
  }
```

When `size="fullscreen"`, the `sizeClasses.fullscreen` string overrides the default centering/sizing classes via `cn()` (tailwind-merge).

Also, in the `DialogPrimitive.Close` button (line 62), add a larger touch target for mobile:

```ts
// Replace the existing Close button
<DialogPrimitive.Close className={cn(
  "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
  size === "fullscreen" && "hidden",
)}>
  <X className="h-4 w-4" />
  <span className="sr-only">Close</span>
</DialogPrimitive.Close>
```

Note: When fullscreen, the close button is hidden because `ContentOverlay` renders its own mobile-friendly close button in the header with a 44px touch target.

Then in `ContentOverlay.tsx`, export the mobile classes constant:

```ts
export const MOBILE_DIALOG_CLASSES = "inset-0 max-w-none max-h-none rounded-none border-0 translate-x-0 translate-y-0 left-0 top-0 shadow-none data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/ContentOverlay.test.tsx`
Expected: PASS — all 3 tests green

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `bun test src/client/components/rich-content/ src/client/components/ui/`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/client/components/ui/dialog.tsx src/client/components/rich-content/ContentOverlay.tsx src/client/components/rich-content/ContentOverlay.test.tsx
git commit -m "feat: add fullscreen size variant to Dialog for mobile content viewer"
```

---

### Task 4: `ViewerToolbar` Component

**Files:**
- Create: `src/client/components/rich-content/ViewerToolbar.tsx`
- Create: `src/client/components/rich-content/ViewerToolbar.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/client/components/rich-content/ViewerToolbar.test.tsx
import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ViewerToolbar } from "./ViewerToolbar"
import type { ViewerState, ViewerAction } from "./ContentViewerContext"

function noop(_action: ViewerAction) {}

describe("ViewerToolbar", () => {
  test("renders line numbers toggle for code type", () => {
    const state: ViewerState = { type: "code", lineNumbers: false }
    const html = renderToStaticMarkup(
      <ViewerToolbar state={state} dispatch={noop} />
    )
    expect(html).toContain("Ln #")
    expect(html).toContain('aria-pressed="false"')
  })

  test("renders unified/split toggle for diff type", () => {
    const state: ViewerState = { type: "diff", viewMode: "unified" }
    const html = renderToStaticMarkup(
      <ViewerToolbar state={state} dispatch={noop} />
    )
    expect(html).toContain("Unified")
    expect(html).toContain("Split")
  })

  test("renders render/source toggle and zoom for embed type", () => {
    const state: ViewerState = { type: "embed", renderMode: "render", zoom: 1 }
    const html = renderToStaticMarkup(
      <ViewerToolbar state={state} dispatch={noop} />
    )
    expect(html).toContain("Render")
    expect(html).toContain("Source")
    expect(html).toContain("100%")
  })

  test("shows zoom percentage for embed", () => {
    const state: ViewerState = { type: "embed", renderMode: "render", zoom: 1.5 }
    const html = renderToStaticMarkup(
      <ViewerToolbar state={state} dispatch={noop} />
    )
    expect(html).toContain("150%")
  })

  test("renders TOC button for markdown type", () => {
    const state: ViewerState = { type: "markdown", tocOpen: false, headings: [] }
    const html = renderToStaticMarkup(
      <ViewerToolbar state={state} dispatch={noop} />
    )
    expect(html).toContain("TOC")
  })

  test("marks active segment for diff unified mode", () => {
    const state: ViewerState = { type: "diff", viewMode: "unified" }
    const html = renderToStaticMarkup(
      <ViewerToolbar state={state} dispatch={noop} />
    )
    // The "Unified" button should have the active styling
    expect(html).toContain('aria-pressed="true"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/ViewerToolbar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```tsx
// src/client/components/rich-content/ViewerToolbar.tsx
import { memo } from "react"
import { Hash, Minus, Plus, RotateCcw, List } from "lucide-react"
import { cn } from "../../lib/utils"
import type { ViewerState, ViewerAction } from "./ContentViewerContext"

interface ViewerToolbarProps {
  state: ViewerState
  dispatch: (action: ViewerAction) => void
}

export const ViewerToolbar = memo(function ViewerToolbar({
  state,
  dispatch,
}: ViewerToolbarProps) {
  switch (state.type) {
    case "code":
      return (
        <ToolbarRow>
          <ToggleButton
            label="Ln #"
            icon={<Hash className="h-3 w-3" />}
            pressed={state.lineNumbers}
            onClick={() => dispatch({ type: "TOGGLE_LINE_NUMBERS" })}
          />
        </ToolbarRow>
      )

    case "diff":
      return (
        <ToolbarRow>
          <SegmentGroup>
            <SegmentButton
              label="Unified"
              active={state.viewMode === "unified"}
              onClick={() => dispatch({ type: "TOGGLE_VIEW_MODE" })}
            />
            <SegmentButton
              label="Split"
              active={state.viewMode === "split"}
              onClick={() => dispatch({ type: "TOGGLE_VIEW_MODE" })}
            />
          </SegmentGroup>
        </ToolbarRow>
      )

    case "embed":
      return (
        <ToolbarRow>
          <SegmentGroup>
            <SegmentButton
              label="Render"
              active={state.renderMode === "render"}
              onClick={() => dispatch({ type: "SET_RENDER_MODE", payload: "render" })}
            />
            <SegmentButton
              label="Source"
              active={state.renderMode === "source"}
              onClick={() => dispatch({ type: "SET_RENDER_MODE", payload: "source" })}
            />
          </SegmentGroup>
          <div className="flex items-center gap-1">
            <ZoomButton
              icon={<Minus className="h-3 w-3" />}
              label="Zoom out"
              onClick={() => dispatch({ type: "ZOOM_OUT" })}
            />
            <button
              type="button"
              aria-label="Reset zoom"
              onClick={() => dispatch({ type: "ZOOM_RESET" })}
              className="min-w-[3rem] rounded px-1.5 py-1 text-center text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {Math.round(state.zoom * 100)}%
            </button>
            <ZoomButton
              icon={<Plus className="h-3 w-3" />}
              label="Zoom in"
              onClick={() => dispatch({ type: "ZOOM_IN" })}
            />
          </div>
        </ToolbarRow>
      )

    case "markdown":
      return (
        <ToolbarRow>
          <ToggleButton
            label="TOC"
            icon={<List className="h-3 w-3" />}
            pressed={state.tocOpen}
            onClick={() => dispatch({ type: "TOGGLE_TOC" })}
          />
        </ToolbarRow>
      )
  }
})

// --- Shared sub-components ---

function ToolbarRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
      {children}
    </div>
  )
}

function SegmentGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5 text-xs">
      {children}
    </div>
  )
}

function SegmentButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function ToggleButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
        pressed
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function ZoomButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {icon}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/ViewerToolbar.test.tsx`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add src/client/components/rich-content/ViewerToolbar.tsx src/client/components/rich-content/ViewerToolbar.test.tsx
git commit -m "feat: add ViewerToolbar with contextual controls per content type"
```

---

### Task 5: Wire `ContentOverlay` — Context Provider + Mobile Responsive

**Files:**
- Modify: `src/client/components/rich-content/ContentOverlay.tsx`
- Modify: `src/client/components/rich-content/ContentOverlay.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `ContentOverlay.test.tsx`:

```ts
// Add these tests to the existing describe block in ContentOverlay.test.tsx
import { describe, expect, test } from "bun:test"
import {
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  getContentOverlayUiIdentityProps,
  MOBILE_DIALOG_CLASSES,
  DESKTOP_DIALOG_SIZE,
} from "./ContentOverlay"
import { DIALOG_BODY_INSET_CLASS_NAME } from "../ui/dialog"
import { createInitialState } from "./ContentViewerContext"

describe("ContentOverlay", () => {
  test("reuses the dialog body inset baseline for fullscreen content", () => {
    expect(CONTENT_OVERLAY_INNER_CLASS_NAME).toContain("px-4 pb-4")
    expect(CONTENT_OVERLAY_INNER_CLASS_NAME).toContain("pt-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("px-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("pb-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("pt-3.5")
  })

  test("tags the fullscreen rich-content viewer root so the overlay can grab it", () => {
    expect(CONTENT_OVERLAY_ROOT_UI_ID).toBe("rich-content.viewer.area")
    expect(getContentOverlayUiIdentityProps()).toEqual({
      "data-ui-id": "rich-content.viewer.area",
    })
  })

  test("mobile dialog classes include fullscreen inset and slide-up animation", () => {
    expect(MOBILE_DIALOG_CLASSES).toContain("inset-0")
    expect(MOBILE_DIALOG_CLASSES).toContain("max-w-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("rounded-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("slide-in-from-bottom")
  })

  test("desktop dialog size is xl", () => {
    expect(DESKTOP_DIALOG_SIZE).toBe("xl")
  })

  test("createInitialState produces correct state for each content type", () => {
    expect(createInitialState("code").type).toBe("code")
    expect(createInitialState("diff").type).toBe("diff")
    expect(createInitialState("embed").type).toBe("embed")
    expect(createInitialState("markdown").type).toBe("markdown")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/ContentOverlay.test.tsx`
Expected: FAIL — `MOBILE_DIALOG_CLASSES` and `DESKTOP_DIALOG_SIZE` not exported

- [ ] **Step 3: Rewrite ContentOverlay.tsx with context provider and responsive sizing**

Replace `src/client/components/rich-content/ContentOverlay.tsx` entirely:

```tsx
// src/client/components/rich-content/ContentOverlay.tsx
import { useCallback, useReducer, useState, type ReactNode } from "react"
import { ArrowLeft, Code, FileText, GitCompareArrows, Image, Copy, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogClose,
  DIALOG_BODY_INSET_CLASS_NAME,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { useIsMobile } from "../../hooks/useIsMobile"
import {
  ContentViewerContext,
  viewerReducer,
  createInitialState,
} from "./ContentViewerContext"
import { ViewerToolbar } from "./ViewerToolbar"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code,
  markdown: FileText,
  embed: Image,
  diff: GitCompareArrows,
}

const CONTENT_OVERLAY_INNER_CLASS_NAME = `${DIALOG_BODY_INSET_CLASS_NAME} pt-4`
const CONTENT_OVERLAY_ROOT_UI_ID = "rich-content.viewer.area"
const DESKTOP_DIALOG_SIZE = "xl" as const

const MOBILE_DIALOG_CLASSES =
  "inset-0 max-w-none max-h-none h-[100dvh] rounded-none border-0 translate-x-0 translate-y-0 left-0 top-0 shadow-none data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"

interface ContentOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  type: RichContentType
  children: ReactNode
  rawContent?: string
}

function getContentOverlayUiIdentityProps() {
  return getUiIdentityAttributeProps(CONTENT_OVERLAY_ROOT_UI_ID)
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
  const isMobile = useIsMobile()
  const [viewerState, dispatch] = useReducer(viewerReducer, type, createInitialState)
  const Icon = typeIcons[type]

  const handleCopy = useCallback(async () => {
    if (!rawContent) return
    await navigator.clipboard.writeText(rawContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [rawContent])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={isMobile ? "fullscreen" : DESKTOP_DIALOG_SIZE}
        className={cn(isMobile && MOBILE_DIALOG_CLASSES)}
        {...getContentOverlayUiIdentityProps()}
      >
        <ContentViewerContext.Provider value={{ state: viewerState, dispatch }}>
          <DialogHeader className={cn(isMobile && "pt-[env(safe-area-inset-top)]")}>
            <div className="flex items-center gap-2 pr-8">
              {isMobile ? (
                <DialogClose asChild>
                  <button
                    type="button"
                    aria-label="Close"
                    className="flex h-11 w-11 -ml-2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                </DialogClose>
              ) : (
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <DialogTitle className="truncate text-sm">
                {title ?? type}
              </DialogTitle>
              {rawContent ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "ml-auto shrink-0 text-muted-foreground",
                    isMobile ? "h-11 w-11" : "h-7 w-7",
                    !copied && "hover:text-foreground",
                    copied && "hover:!bg-transparent",
                  )}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className={cn(isMobile ? "h-5 w-5" : "h-3.5 w-3.5", "text-green-400")} />
                  ) : (
                    <Copy className={cn(isMobile ? "h-5 w-5" : "h-3.5 w-3.5")} />
                  )}
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          {isMobile ? <ViewerToolbar state={viewerState} dispatch={dispatch} /> : null}

          <DialogBody className={cn("p-0", isMobile && "pb-[env(safe-area-inset-bottom)]")}>
            <div className={CONTENT_OVERLAY_INNER_CLASS_NAME}>
              {children}
            </div>
          </DialogBody>
        </ContentViewerContext.Provider>
      </DialogContent>
    </Dialog>
  )
}

export {
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  MOBILE_DIALOG_CLASSES,
  DESKTOP_DIALOG_SIZE,
  getContentOverlayUiIdentityProps,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/rich-content/ContentOverlay.test.tsx`
Expected: PASS — all tests green

- [ ] **Step 5: Run full rich-content test suite for regressions**

Run: `bun test src/client/components/rich-content/`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/client/components/rich-content/ContentOverlay.tsx src/client/components/rich-content/ContentOverlay.test.tsx
git commit -m "feat: wire ContentOverlay with viewer context, mobile responsive fullscreen"
```

---

### Task 6: `EmbedRenderer` Context Integration

**Files:**
- Modify: `src/client/components/rich-content/EmbedRenderer.tsx` (lines 209-274, `SvgEmbed`)
- Modify: `src/client/components/rich-content/EmbedRenderer.test.tsx`

- [ ] **Step 1: Write failing test for context consumption**

Add to `EmbedRenderer.test.tsx`:

```tsx
// Add at bottom of existing describe("EmbedRenderer") block
import { ContentViewerContext, type ContentViewerContextValue } from "./ContentViewerContext"

describe("EmbedRenderer with ContentViewerContext", () => {
  test("svg hides inline controls when viewer context is present", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "render", zoom: 1 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer
          format="svg"
          source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'}
        />
      </ContentViewerContext.Provider>
    )

    // Inline render/source toggle should be hidden
    expect(html).not.toContain('aria-label="SVG display mode"')
    // Content should still render
    expect(html).toContain("data-svg-render")
  })

  test("svg uses context renderMode instead of local state", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "source", zoom: 1 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer
          format="svg"
          source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'}
        />
      </ContentViewerContext.Provider>
    )

    // Should show source view, not render view
    expect(html).not.toContain("data-svg-render")
    expect(html).toContain("&lt;svg")
  })

  test("svg applies zoom transform from context", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "render", zoom: 1.5 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer
          format="svg"
          source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'}
        />
      </ContentViewerContext.Provider>
    )

    expect(html).toContain("scale(1.5)")
  })

  test("svg falls back to local state when no context", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer
        format="svg"
        source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'}
      />
    )

    // Should show inline controls (no context)
    expect(html).toContain('aria-label="SVG display mode"')
    expect(html).toContain("data-svg-render")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/EmbedRenderer.test.tsx`
Expected: FAIL — SVG still shows inline controls inside context

- [ ] **Step 3: Update SvgEmbed to consume ContentViewerContext**

Modify `SvgEmbed` in `EmbedRenderer.tsx` (replace lines 209-274):

```tsx
function SvgEmbed({ source }: { source: string }) {
  const viewer = useContentViewer()
  const [localMode, setLocalMode] = useState<"render" | "source">("render")

  // Use context state when inside overlay, local state when inline
  const isInOverlay = viewer !== null && viewer.state.type === "embed"
  const mode = isInOverlay ? viewer.state.renderMode : localMode
  const zoom = isInOverlay ? viewer.state.zoom : 1

  const parsed = parseSvgMarkup(source)
  const svgDataUrl = parsed.ok
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(parsed.markup)}`
    : null

  return (
    <div className="space-y-3 p-3">
      {!isInOverlay ? (
        <div aria-label="SVG display mode" className="flex items-center gap-1 rounded-md bg-muted/50 p-1 text-xs">
          <button
            type="button"
            aria-pressed={localMode === "render"}
            onClick={() => setLocalMode("render")}
            className={`rounded px-2 py-1 transition-colors ${
              localMode === "render" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Render
          </button>
          <button
            type="button"
            aria-pressed={localMode === "source"}
            onClick={() => setLocalMode("source")}
            className={`rounded px-2 py-1 transition-colors ${
              localMode === "source" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Source
          </button>
        </div>
      ) : null}

      {mode === "render" ? (
        parsed.ok ? (
          <div
            style={zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: "top left" } : undefined}
          >
            <img
              data-svg-render="true"
              alt=""
              src={svgDataUrl ?? undefined}
              className="block h-auto max-h-[320px] max-w-full rounded-md border border-border/60 bg-background p-3 w-auto"
            />
            <script type="text/plain" data-svg-source="true">
              {source}
            </script>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-destructive">{parsed.message}</div>
            <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
              {source}
            </pre>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {!parsed.ok ? (
            <div className="text-xs text-destructive">{parsed.message}</div>
          ) : null}
          <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
            {source}
          </pre>
        </div>
      )}
    </div>
  )
}
```

Also add the import at the top of `EmbedRenderer.tsx`:

```ts
import { useContentViewer } from "./ContentViewerContext"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/rich-content/EmbedRenderer.test.tsx`
Expected: PASS — all tests green (both new and existing)

- [ ] **Step 5: Run full test suite**

Run: `bun test src/client/components/rich-content/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/client/components/rich-content/EmbedRenderer.tsx src/client/components/rich-content/EmbedRenderer.test.tsx
git commit -m "feat: EmbedRenderer consumes ContentViewerContext for render mode and zoom"
```

---

### Task 7: Markdown TOC Panel

**Files:**
- Create: `src/client/components/rich-content/TocPanel.tsx`
- Create: `src/client/components/rich-content/TocPanel.test.tsx`

The markdown TOC panel renders when `tocOpen` is true in the viewer context. It displays headings extracted from rendered content and smooth-scrolls to them on tap.

- [ ] **Step 1: Write failing tests**

```tsx
// src/client/components/rich-content/TocPanel.test.tsx
import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TocPanel } from "./TocPanel"
import type { TocHeading } from "./ContentViewerContext"

describe("TocPanel", () => {
  test("renders nothing when headings array is empty", () => {
    const html = renderToStaticMarkup(
      <TocPanel headings={[]} onSelect={() => {}} />
    )
    expect(html).toBe("")
  })

  test("renders heading list with correct nesting", () => {
    const headings: TocHeading[] = [
      { level: 1, text: "Introduction", id: "introduction" },
      { level: 2, text: "Getting Started", id: "getting-started" },
      { level: 3, text: "Prerequisites", id: "prerequisites" },
    ]
    const html = renderToStaticMarkup(
      <TocPanel headings={headings} onSelect={() => {}} />
    )
    expect(html).toContain("Introduction")
    expect(html).toContain("Getting Started")
    expect(html).toContain("Prerequisites")
  })

  test("applies indent based on heading level", () => {
    const headings: TocHeading[] = [
      { level: 1, text: "H1", id: "h1" },
      { level: 2, text: "H2", id: "h2" },
      { level: 3, text: "H3", id: "h3" },
    ]
    const html = renderToStaticMarkup(
      <TocPanel headings={headings} onSelect={() => {}} />
    )
    // H2 should have pl-3, H3 should have pl-6
    expect(html).toContain("pl-3")
    expect(html).toContain("pl-6")
  })

  test("renders clickable buttons for each heading", () => {
    const headings: TocHeading[] = [
      { level: 1, text: "Title", id: "title" },
    ]
    const html = renderToStaticMarkup(
      <TocPanel headings={headings} onSelect={() => {}} />
    )
    expect(html).toContain("<button")
    expect(html).toContain("Title")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/TocPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```tsx
// src/client/components/rich-content/TocPanel.tsx
import { memo } from "react"
import { cn } from "../../lib/utils"
import type { TocHeading } from "./ContentViewerContext"

interface TocPanelProps {
  headings: TocHeading[]
  onSelect: (id: string) => void
}

const levelIndent: Record<number, string> = {
  1: "",
  2: "pl-3",
  3: "pl-6",
}

export const TocPanel = memo(function TocPanel({ headings, onSelect }: TocPanelProps) {
  if (headings.length === 0) return null

  return (
    <nav aria-label="Table of contents" className="border-b border-border bg-muted/20 px-3 py-2">
      <ul className="flex flex-col gap-0.5">
        {headings.map((heading) => (
          <li key={heading.id}>
            <button
              type="button"
              onClick={() => onSelect(heading.id)}
              className={cn(
                "w-full truncate rounded px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                levelIndent[heading.level] ?? "pl-6",
              )}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/TocPanel.test.tsx`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Wire TocPanel into ContentOverlay**

In `src/client/components/rich-content/ContentOverlay.tsx`, add the TOC panel below the ViewerToolbar when markdown type and tocOpen is true:

```tsx
// Add import at top
import { TocPanel } from "./TocPanel"

// In the JSX, after the ViewerToolbar line, add:
{isMobile && viewerState.type === "markdown" && viewerState.tocOpen ? (
  <TocPanel
    headings={viewerState.headings}
    onSelect={(id) => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }}
  />
) : null}
```

- [ ] **Step 6: Run full test suite**

Run: `bun test src/client/components/rich-content/`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/client/components/rich-content/TocPanel.tsx src/client/components/rich-content/TocPanel.test.tsx src/client/components/rich-content/ContentOverlay.tsx
git commit -m "feat: add TocPanel for markdown heading navigation in mobile viewer"
```

---

### Task 8: Integration Smoke Test + Type Check

**Files:**
- No new files — verification only

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass — zero regressions

- [ ] **Step 2: Type check**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No type errors

- [ ] **Step 3: Build check**

Run: `bun run check`
Expected: Clean build

- [ ] **Step 4: Commit any fixes if needed**

If type errors or test failures are found, fix them and commit with:

```bash
git commit -m "fix: address type/test issues from mobile content viewer integration"
```

---

### Task 9: Visual Smoke Test

**Files:**
- No code changes — browser verification

- [ ] **Step 1: Start dev server**

Run: `bun run dev`

- [ ] **Step 2: Desktop verification**

Use `agent-browser` to:
1. Open the app at the local URL
2. Navigate to a chat with rich content (code blocks, embeds)
3. Click the maximize icon on a rich content block
4. Verify: dialog opens as centered card with `max-w-4xl`, rounded corners, fade+zoom animation
5. Screenshot to confirm desktop is unchanged

- [ ] **Step 3: Mobile verification**

Use `agent-browser` to:
1. Resize viewport to 375x812 (iPhone dimensions)
2. Click the maximize icon on a rich content block
3. Verify: overlay fills entire viewport edge-to-edge, slides up from bottom
4. Verify: toolbar shows contextual controls for the content type
5. Verify: close button (arrow) has large touch target
6. Verify: copy button has large touch target
7. Screenshot to confirm mobile fullscreen works

- [ ] **Step 4: Record findings**

Note any visual issues to fix. If clean, the feature is verified.
