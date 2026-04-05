import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { EmbedRenderer, isEmbedLanguage } from "./EmbedRenderer"
import { ContentViewerContext, type ContentViewerContextValue } from "./ContentViewerContext"

describe("isEmbedLanguage", () => {
  test("returns true for mermaid", () => {
    expect(isEmbedLanguage("mermaid")).toBe(true)
  })

  test("returns true for d2", () => {
    expect(isEmbedLanguage("d2")).toBe(true)
  })

  test("returns true for svg", () => {
    expect(isEmbedLanguage("svg")).toBe(true)
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

  test("renders svg as an image-first surface with render and source views", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer
        format="svg"
        source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'}
      />
    )

    expect(html).toContain("Render")
    expect(html).toContain("Source")
    expect(html).toContain("data-svg-render")
    expect(html).toContain("<rect")
  })

  test("shows svg render error fallback with escaped source visibility", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="svg" source={"<svg><rect></svg>"} />
    )

    expect(html).toContain("SVG render error")
    expect(html).not.toContain("data-svg-render")
    expect(html).toContain("&lt;svg&gt;")
  })

  test("accepts svg with xml prolog, doctype, comments, and cdata style blocks", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer
        format="svg"
        source={`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<!-- exported -->
<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
  <style><![CDATA[rect { fill: red; }]]></style>
  <rect width="10" height="10" />
</svg>`}
      />
    )

    expect(html).toContain("data-svg-render")
    expect(html).not.toContain("SVG render error")
  })
})

describe("EmbedRenderer with ContentViewerContext", () => {
  test("svg hides inline controls when viewer context is present", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "render", zoom: 1 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer format="svg" source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'} />
      </ContentViewerContext.Provider>
    )
    expect(html).not.toContain('aria-label="SVG display mode"')
    expect(html).toContain("data-svg-render")
  })

  test("svg uses context renderMode instead of local state", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "source", zoom: 1 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer format="svg" source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'} />
      </ContentViewerContext.Provider>
    )
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
        <EmbedRenderer format="svg" source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'} />
      </ContentViewerContext.Provider>
    )
    expect(html).toContain("scale(1.5)")
  })

  test("svg falls back to local state when no context", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="svg" source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'} />
    )
    expect(html).toContain('aria-label="SVG display mode"')
    expect(html).toContain("data-svg-render")
  })
})
