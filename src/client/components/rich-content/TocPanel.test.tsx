import { describe, test, expect } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TocPanel } from "./TocPanel"
import type { TocHeading } from "./ContentViewerContext"

describe("TocPanel", () => {
  test("renders nothing when headings array is empty", () => {
    const html = renderToStaticMarkup(<TocPanel headings={[]} onSelect={() => {}} />)
    expect(html).toBe("")
  })
  test("renders heading list with correct nesting", () => {
    const headings: TocHeading[] = [
      { level: 1, text: "Introduction", id: "introduction" },
      { level: 2, text: "Getting Started", id: "getting-started" },
      { level: 3, text: "Prerequisites", id: "prerequisites" },
    ]
    const html = renderToStaticMarkup(<TocPanel headings={headings} onSelect={() => {}} />)
    expect(html).toContain('data-ui-id="rich-content.toc.area"')
    expect(html).toContain('data-ui-c3="c3-107"')
    expect(html).toContain('data-ui-c3-label="rich-content"')
    expect(html).toContain('data-ui-id="rich-content.toc.item"')
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
    const html = renderToStaticMarkup(<TocPanel headings={headings} onSelect={() => {}} />)
    expect(html).toContain("pl-3")
    expect(html).toContain("pl-6")
  })
  test("renders clickable buttons for each heading", () => {
    const headings: TocHeading[] = [{ level: 1, text: "Title", id: "title" }]
    const html = renderToStaticMarkup(<TocPanel headings={headings} onSelect={() => {}} />)
    expect(html).toContain("<button")
    expect(html).toContain("Title")
  })
})
