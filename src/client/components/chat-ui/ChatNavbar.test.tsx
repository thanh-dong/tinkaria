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
        onForkSession={() => {}}
      />,
    )

    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).not.toContain("lucide-flower")
  })

  test("renders a fork-session button instead of compose", () => {
    const html = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed={false}
        onOpenSidebar={() => {}}
        onCollapseSidebar={() => {}}
        onExpandSidebar={() => {}}
        onForkSession={() => {}}
      />,
    )

    expect(html).toContain('title="Fork session"')
    expect(html).not.toContain('title="Compose"')
  })

  test("renders current session runtime details in the navbar", () => {
    const html = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed={false}
        onOpenSidebar={() => {}}
        onCollapseSidebar={() => {}}
        onExpandSidebar={() => {}}
        onForkSession={() => {}}
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
    expect(html).toContain("~16% ctx")
    expect(html).not.toContain("4.3K used")
    expect(html).not.toContain("5h 13%")
    expect(html).not.toContain("7d 7%")
    expect(html).not.toContain("gpt-5.4")
  })
})
