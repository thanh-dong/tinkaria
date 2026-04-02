import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatNavbar } from "./ChatNavbar"

describe("ChatNavbar", () => {
  test("uses the branded tinkaria mark when the sidebar is collapsed", () => {
    const html = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed
        onOpenSidebar={() => {}}
        onExpandSidebar={() => {}}
        onNewChat={() => {}}
      />,
    )

    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).not.toContain("lucide-flower")
  })
})
