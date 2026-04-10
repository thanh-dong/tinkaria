import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ViewerToolbar } from "./ViewerToolbar"
import type { ViewerState, ViewerAction } from "./ContentViewerContext"

function noop(_action: ViewerAction) {}

describe("ViewerToolbar", () => {
  test("renders line numbers toggle for code type", () => {
    const state: ViewerState = { type: "code", lineNumbers: false }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain('aria-label="Toggle line numbers"')
    expect(html).toContain('aria-pressed="false"')
  })
  test("renders unified/split toggle for diff type", () => {
    const state: ViewerState = { type: "diff", viewMode: "unified" }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain('aria-label="Unified view"')
    expect(html).toContain('aria-label="Split view"')
  })
  test("renders render/source toggle and zoom for embed type", () => {
    const state: ViewerState = { type: "embed", renderMode: "render", zoom: 1 }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain('aria-label="Show rendered"')
    expect(html).toContain('aria-label="Show source"')
    expect(html).toContain("100%")
  })
  test("shows zoom percentage for embed", () => {
    const state: ViewerState = { type: "embed", renderMode: "render", zoom: 1.5 }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain("150%")
  })
  test("renders TOC button for markdown type", () => {
    const state: ViewerState = { type: "markdown", tocOpen: false, headings: [] }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain('aria-label="Table of contents"')
  })
  test("marks active segment for diff unified mode", () => {
    const state: ViewerState = { type: "diff", viewMode: "unified" }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain('aria-pressed="true"')
  })
  test("all controls use icon-only buttons without text labels", () => {
    const states: ViewerState[] = [
      { type: "code", lineNumbers: false },
      { type: "diff", viewMode: "unified" },
      { type: "embed", renderMode: "render", zoom: 1 },
      { type: "markdown", tocOpen: false, headings: [] },
    ]
    for (const state of states) {
      const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
      // No text labels — only icons with aria-labels
      expect(html).not.toContain(">Ln #<")
      expect(html).not.toContain(">Render<")
      expect(html).not.toContain(">Source<")
      expect(html).not.toContain(">Unified<")
      expect(html).not.toContain(">Split<")
      expect(html).not.toContain(">TOC<")
    }
  })
})
