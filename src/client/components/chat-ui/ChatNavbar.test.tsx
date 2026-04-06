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
        localPath="/workspace/kanna"
        accountInfo={{ subscriptionType: "pro" }}
        currentRepoStatus={{
          localPath: "/workspace/kanna",
          branch: "feat/status-bar",
          stagedCount: 1,
          unstagedCount: 2,
          untrackedCount: 3,
          ahead: 1,
          behind: 0,
          isRepo: true,
        }}
        currentSessionRuntime={{
          model: "gpt-5.4",
          tokenUsage: {
            totalTokens: 4312,
            estimatedContextPercent: 16,
          },
          usageBuckets: [
            { label: "5h", usedPercent: 13 },
            { label: "7d", usedPercent: 7 },
          ],
        }}
      />,
    )

    expect(html).toContain("kanna")
    expect(html).toContain("feat/status-bar +1")
    expect(html).toContain("S1 M2 ?3")
    expect(html).toContain("pro")
    expect(html).toContain("gpt-5.4")
    expect(html).toContain("~16% ctx")
    expect(html).toContain("4.3K used")
    expect(html).toContain("5h 13%")
    expect(html).toContain("7d 7%")
  })
})
