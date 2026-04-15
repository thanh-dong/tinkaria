import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import {
  CONTENT_BLOCK_BODY_CLASS_NAME,
  getRichContentBlockUiIdentityDescriptor,
  RichContentBlock,
  RichContentChromeProvider,
} from "./RichContentBlock"

describe("RichContentBlock", () => {
  test("exposes rich-content ownership for grab targets", () => {
    expect(getUiIdentityAttributeProps(getRichContentBlockUiIdentityDescriptor())).toEqual({
      "data-ui-id": "rich-content.block",
      "data-ui-c3": "c3-107",
      "data-ui-c3-label": "rich-content",
    })
  })

  test("renders children inside wrapper", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="TypeScript">
        <pre><code>const x = 1</code></pre>
      </RichContentBlock>
    )

    expect(html).toContain('data-ui-id="rich-content.block"')
    expect(html).toContain('data-ui-c3="c3-107"')
    expect(html).toContain('data-ui-c3-label="rich-content"')
    expect(html).toContain("const x = 1")
    expect(html).toContain("TypeScript")
  })

  test("renders collapsed by default (defaultExpanded=false)", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code">
        <pre><code>line1</code></pre>
      </RichContentBlock>
    )

    expect(html).toContain("max-h-")
    expect(html).toContain("overflow-hidden")
  })

  test("renders expanded when defaultExpanded is true", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code" defaultExpanded>
        <pre><code>line1</code></pre>
      </RichContentBlock>
    )

    expect(html).not.toContain("max-h-")
  })

  test("shows correct icon for each content type", () => {
    const codeHtml = renderToStaticMarkup(
      <RichContentBlock type="code"><pre>x</pre></RichContentBlock>
    )
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

  test("applies inset padding to inline rich content body", () => {
    expect(CONTENT_BLOCK_BODY_CLASS_NAME).toContain("px-4")
    expect(CONTENT_BLOCK_BODY_CLASS_NAME).toContain("pb-4")
    expect(CONTENT_BLOCK_BODY_CLASS_NAME).toContain("pt-3.5")
  })

  test("renders copy button in header when rawContent is provided", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code" rawContent="const x = 1">
        <pre>const x = 1</pre>
      </RichContentBlock>
    )

    expect(html).toContain('aria-label="Copy content"')
  })

  test("does not render copy button when rawContent is absent", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code">
        <pre>const x = 1</pre>
      </RichContentBlock>
    )

    expect(html).not.toContain('aria-label="Copy content"')
  })

  test("renders embed controls for embed type", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="embed" title="Diagram" rawContent="source">
        <div>embed content</div>
      </RichContentBlock>
    )

    expect(html).toContain('aria-label="Show rendered"')
    expect(html).toContain('aria-label="Show source"')
    expect(html).toContain('aria-label="Zoom out"')
    expect(html).toContain('aria-label="Zoom in"')
    expect(html).toContain("100%")
  })

  test("does not render embed controls for code type", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock type="code" title="Code" rawContent="x">
        <pre>x</pre>
      </RichContentBlock>
    )

    expect(html).not.toContain('aria-label="Show rendered"')
    expect(html).not.toContain('aria-label="Zoom out"')
  })

  test("renders expand and fullscreen controls for all types", () => {
    for (const type of ["code", "markdown", "embed", "diff"] as const) {
      const html = renderToStaticMarkup(
        <RichContentBlock type={type} title="Test">
          <div>content</div>
        </RichContentBlock>
      )

      expect(html).toContain('aria-label="Expand content"')
      expect(html).toContain('aria-label="Open in overlay"')
    }
  })

  test("provides ContentViewerContext to children", () => {
    // The block wraps children in ContentViewerContext.Provider
    // which is verified by the embed controls rendering from viewer state
    const html = renderToStaticMarkup(
      <RichContentBlock type="embed" title="Embed">
        <div>child</div>
      </RichContentBlock>
    )

    // Embed state defaults: renderMode=render, zoom=1
    expect(html).toContain("100%")
  })

  test("supports inline chrome with hover-or-touch revealed controls", () => {
    const html = renderToStaticMarkup(
      <RichContentBlock
        type="markdown"
        chrome="inline"
        controlsVisibility="hover-or-touch"
        rawContent="hello"
      >
        <p>hello</p>
      </RichContentBlock>
    )

    expect(html).not.toContain("rounded-lg border border-border overflow-hidden")
    expect(html).toContain("group-hover/rich-content:opacity-100")
    expect(html).toContain("group-focus-within/rich-content:opacity-100")
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('aria-label="Copy content"')
    expect(html).toContain('aria-label="Open in overlay"')
  })

  test("uses chrome context when a block does not pass explicit chrome", () => {
    const html = renderToStaticMarkup(
      <RichContentChromeProvider chrome="inline" controlsVisibility="hover-or-touch">
        <RichContentBlock type="code" title="Code" rawContent="const x = 1">
          <pre>const x = 1</pre>
        </RichContentBlock>
      </RichContentChromeProvider>
    )

    expect(html).not.toContain("rounded-lg border border-border overflow-hidden")
    expect(html).toContain("group-hover/rich-content:opacity-100")
    expect(html).toContain('tabindex="-1"')
  })
})
