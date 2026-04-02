import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CONTENT_BLOCK_BODY_CLASS_NAME, RichContentBlock } from "./RichContentBlock"

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

  test("applies inset padding to inline rich content body", () => {
    expect(CONTENT_BLOCK_BODY_CLASS_NAME).toContain("px-4")
    expect(CONTENT_BLOCK_BODY_CLASS_NAME).toContain("pb-4")
    expect(CONTENT_BLOCK_BODY_CLASS_NAME).toContain("pt-3.5")
  })
})
