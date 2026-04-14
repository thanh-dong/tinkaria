import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { EmbedRenderer, getEmbedWheelZoomIntent, isEmbedLanguage } from "./EmbedRenderer"
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

  test("returns true for iframe", () => {
    expect(isEmbedLanguage("iframe")).toBe(true)
  })

  test("returns true for diashort", () => {
    expect(isEmbedLanguage("diashort")).toBe(true)
  })

  test("returns false for typescript", () => {
    expect(isEmbedLanguage("typescript")).toBe(false)
  })

  test("returns true for html", () => {
    expect(isEmbedLanguage("html")).toBe(true)
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

    expect(html).toContain("data-mermaid-source")
  })

  test("renders d2 fallback with raw source", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="d2" source="x -> y" />
    )

    expect(html).toContain("x -&gt; y") // HTML-encoded
  })

  test("renders svg content without inline controls", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer
        format="svg"
        source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'}
      />
    )

    // Should render svg content
    expect(html).toContain("data-svg-render")
    expect(html).toContain("<rect")
    // Should NOT render inline controls (hoisted to RichContentBlock)
    expect(html).not.toContain('aria-label="SVG display mode"')
    expect(html).not.toContain(">Render<")
    expect(html).not.toContain(">Source<")
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

  test("renders iframe embeds as pure content without inline controls", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="iframe" source="https://example.com/embed/widget" />
    )

    expect(html).toContain('data-remote-embed="true"')
    expect(html).toContain('src="https://example.com/embed/widget"')
    // No inline zoom/render controls
    expect(html).not.toContain(">Render<")
    expect(html).not.toContain(">Source<")
  })

  test("normalizes diashort links to the zoomable document view", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="diashort" source="https://diashort.apps.quickable.co/d/abc123" />
    )

    expect(html).toContain('data-remote-embed="true"')
    expect(html).toContain('data-remote-embed-url="https://diashort.apps.quickable.co/d/abc123"')
  })

  test("shows source fallback for invalid remote embed URLs", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="iframe" source="javascript:alert(1)" />
    )

    expect(html).toContain("Embed URL is invalid or unsupported")
    expect(html).not.toContain('data-remote-embed="true"')
  })
})

describe("EmbedRenderer html embed", () => {
  test("renders sandboxed iframe with srcDoc", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="html" source="<h1>Hello</h1>" />
    )

    expect(html).toContain("srcDoc")
    expect(html).toContain("@tailwindcss/browser@4")
    expect(html).toContain("&lt;h1&gt;Hello&lt;/h1&gt;")
    expect(html).toContain('sandbox="allow-scripts"')
  })

  test("does not include allow-same-origin in sandbox", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="html" source="<p>test</p>" />
    )

    expect(html).not.toContain("allow-same-origin")
  })

  test("shows raw HTML in source mode", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "source", zoom: 1 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer format="html" source="<div>mockup</div>" />
      </ContentViewerContext.Provider>
    )

    expect(html).not.toContain("srcDoc")
    expect(html).toContain("&lt;div&gt;mockup&lt;/div&gt;")
  })

})

describe("EmbedRenderer with ContentViewerContext", () => {
  test("svg uses context renderMode", () => {
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

  test("svg falls back to render mode when no context", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="svg" source={'<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'} />
    )
    expect(html).toContain("data-svg-render")
  })

  test("iframe uses context renderMode instead of local state", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "source", zoom: 1 },
      dispatch: () => {},
    }
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer format="iframe" source="https://example.com/embed/widget" />
      </ContentViewerContext.Provider>
    )
    expect(html).not.toContain('data-remote-embed="true"')
    expect(html).toContain("https://example.com/embed/widget")
  })
})

describe("getEmbedWheelZoomIntent", () => {
  test("uses ctrl/cmd wheel to map to embed zoom direction", () => {
    expect(getEmbedWheelZoomIntent({ ctrlKey: true, metaKey: false, deltaY: -10 })).toBe("in")
    expect(getEmbedWheelZoomIntent({ ctrlKey: false, metaKey: true, deltaY: 10 })).toBe("out")
    expect(getEmbedWheelZoomIntent({ ctrlKey: false, metaKey: false, deltaY: -10 })).toBeNull()
    expect(getEmbedWheelZoomIntent({ ctrlKey: true, metaKey: false, deltaY: 0 })).toBeNull()
  })
})
