import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ViewerToolbar } from "./ViewerToolbar"
import type { ViewerState, ViewerAction } from "./ContentViewerContext"

function noop(_action: ViewerAction) {}

describe("ViewerToolbar", () => {
  test("renders line numbers toggle for code type", () => {
    const state: ViewerState = { type: "code", lineNumbers: false }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain("Ln #")
    expect(html).toContain('aria-pressed="false"')
  })
  test("renders unified/split toggle for diff type", () => {
    const state: ViewerState = { type: "diff", viewMode: "unified" }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain("Unified")
    expect(html).toContain("Split")
  })
  test("renders render/source toggle and zoom for embed type", () => {
    const state: ViewerState = { type: "embed", renderMode: "render", zoom: 1 }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain("Render")
    expect(html).toContain("Source")
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
    expect(html).toContain("TOC")
  })
  test("marks active segment for diff unified mode", () => {
    const state: ViewerState = { type: "diff", viewMode: "unified" }
    const html = renderToStaticMarkup(<ViewerToolbar state={state} dispatch={noop} />)
    expect(html).toContain('aria-pressed="true"')
  })
})
