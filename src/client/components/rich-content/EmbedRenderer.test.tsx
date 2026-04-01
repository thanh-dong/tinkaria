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
