import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LocalFilePreviewContent } from "./LocalFilePreviewDialog"

describe("LocalFilePreviewContent", () => {
  test("renders markdown previews as markdown content", () => {
    const html = renderToStaticMarkup(
      <LocalFilePreviewContent
        preview={{
          path: "/tmp/README.md",
          content: "# Hello\n\n[Next](/tmp/next.md#L4)",
        }}
        onOpenLocalLink={() => {}}
      />
    )

    expect(html).toContain("Hello")
    expect(html).toContain("/tmp/next.md#L4")
    expect(html).not.toContain("group/rich-content")
  })

  test("renders non-markdown previews in the code viewer without extra chrome", () => {
    const html = renderToStaticMarkup(
      <LocalFilePreviewContent
        preview={{
          path: "/tmp/app.ts",
          content: "const answer = 42",
          line: 3,
        }}
        onOpenLocalLink={() => {}}
      />
    )

    expect(html).toContain("sh__token--keyword")
    expect(html).toContain("sh__token--identifier")
    expect(html).toContain(">answer<")
    expect(html).not.toContain("group/rich-content")
  })
})
