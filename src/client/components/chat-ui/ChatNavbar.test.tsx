import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatNavbar } from "./ChatNavbar"

describe("ChatNavbar", () => {
  test("uses the branded tinkaria mark when the sidebar is collapsed", () => {
    const html = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed
        onOpenSidebar={() => {}}
        onCollapseSidebar={() => {}}
        onExpandSidebar={() => {}}
        onNewChat={() => {}}
      />,
    )

    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).not.toContain("lucide-flower")
  })

  test("keeps compose in the browser runtime", () => {
    const html = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed={false}
        onOpenSidebar={() => {}}
        onCollapseSidebar={() => {}}
        onExpandSidebar={() => {}}
        onNewChat={() => {}}
      />,
    )

    expect(html).toContain('title="Compose"')
    expect(html).not.toContain('title="Move window"')
    expect(html).not.toContain('title="Toggle maximize"')
  })

  test("renders current session runtime details in the navbar", () => {
    const html = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed={false}
        onOpenSidebar={() => {}}
        onCollapseSidebar={() => {}}
        onExpandSidebar={() => {}}
        onNewChat={() => {}}
        accountInfo={{ subscriptionType: "pro" }}
        currentSessionRuntime={{
          model: "gpt-5.4",
          tokenUsage: {
            totalTokens: 4312,
            contextLeft: 267688,
          },
          usageBuckets: [
            { label: "5h", usedPercent: 13 },
            { label: "7d", usedPercent: 7 },
          ],
        }}
      />,
    )

    expect(html).toContain("pro")
    expect(html).toContain("gpt-5.4")
    expect(html).toContain("4.3K used")
    expect(html).toContain("267.7K left")
    expect(html).toContain("5h 13%")
    expect(html).toContain("7d 7%")
  })
})
