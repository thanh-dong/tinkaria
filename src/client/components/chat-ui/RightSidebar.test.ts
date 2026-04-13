import { describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebar } from "./RightSidebar"

describe("RightSidebar", () => {
  test("renders the placeholder copy", () => {
    const markup = renderToStaticMarkup(RightSidebar({ onClose: () => {} }))

    expect(markup).toContain("diffs coming soon")
    expect(markup).toContain('data-ui-id="chat.right-sidebar"')
    expect(markup).toContain('data-ui-c3="c3-115"')
    expect(markup).toContain('data-ui-c3-label="right-sidebar"')
  })

  test("renders the close affordance", () => {
    const onClose = mock(() => {})
    const markup = renderToStaticMarkup(RightSidebar({ onClose }))

    expect(markup).toContain("Close right sidebar")
  })
})
