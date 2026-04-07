import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "../ui/tooltip"
import { ChatNavbar, getContextBarColor, getContextPercentTextColor } from "./ChatNavbar"

function renderNavbar(props: Parameters<typeof ChatNavbar>[0]) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ChatNavbar {...props} />
    </TooltipProvider>,
  )
}

const defaultProps = {
  onOpenSidebar: () => {},
  onCollapseSidebar: () => {},
  onExpandSidebar: () => {},
  onForkSession: () => {},
} as const

describe("ChatNavbar", () => {
  test("pill has no branding mark — consistent width regardless of sidebar state", () => {
    const collapsed = renderNavbar({ sidebarCollapsed: true, ...defaultProps })
    const expanded = renderNavbar({ sidebarCollapsed: false, ...defaultProps })

    expect(collapsed).not.toContain("tinkaria-mark")
    expect(expanded).not.toContain("tinkaria-mark")
  })

  test("renders a fork-session button", () => {
    const html = renderNavbar({ sidebarCollapsed: false, ...defaultProps })

    expect(html).toContain('title="Fork session"')
  })

  test("renders model indicator icon in left pill when runtime has model", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: { model: "claude-sonnet-4-5" },
    })

    expect(html).toContain('data-testid="model-indicator"')
    expect(html).toContain('viewBox="0 0 24 24"')
  })

  test("renders OpenAI icon for codex models", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: { model: "gpt-5.4" },
    })

    expect(html).toContain('data-testid="model-indicator"')
    expect(html).toContain('viewBox="0 0 158.7128 157.296"')
  })

  test("hides model indicator when no runtime model", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: null,
    })

    expect(html).not.toContain('data-testid="model-indicator"')
  })

  test("renders compact repo label with branch and ahead count", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      localPath: "/workspace/kanna",
      currentRepoStatus: {
        localPath: "/workspace/kanna",
        branch: "feat/status-bar",
        stagedCount: 1,
        unstagedCount: 2,
        untrackedCount: 3,
        ahead: 1,
        behind: 0,
        isRepo: true,
      },
    })

    expect(html).toContain("kanna")
    expect(html).toContain("feat/status-bar +1")
  })

  test("renders context usage bar with percentage", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: {
        model: "gpt-5.4",
        tokenUsage: {
          totalTokens: 4312,
          estimatedContextPercent: 16,
        },
      },
    })

    expect(html).toContain('data-testid="context-bar"')
    expect(html).toContain("16%")
    expect(html).toContain("bg-emerald-500")
  })

  test("does not render subscription type or usage buckets", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      localPath: "/workspace/kanna",
      currentSessionRuntime: {
        model: "gpt-5.4",
        tokenUsage: {
          totalTokens: 4312,
          estimatedContextPercent: 16,
        },
        usageBuckets: [
          { label: "5h", usedPercent: 13 },
          { label: "7d", usedPercent: 7 },
        ],
      },
      currentRepoStatus: {
        localPath: "/workspace/kanna",
        branch: "feat/status-bar",
        stagedCount: 1,
        unstagedCount: 2,
        untrackedCount: 3,
        ahead: 1,
        behind: 0,
        isRepo: true,
      },
    })

    expect(html).not.toContain("5h 13%")
    expect(html).not.toContain("7d 7%")
    expect(html).not.toContain("4.3K used")
    expect(html).not.toContain(">gpt-5.4<")
  })

  test("hides context bar when no token usage data", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: { model: "claude-sonnet-4-5" },
    })

    expect(html).not.toContain('data-testid="context-bar"')
  })

  test("shows session title when sidebar is collapsed", () => {
    const html = renderNavbar({
      sidebarCollapsed: true,
      ...defaultProps,
      chatTitle: "Adding dark mode toggle",
      chatStatus: "idle",
    })

    expect(html).toContain("Adding dark mode toggle")
    expect(html).toContain('data-testid="session-summary"')
  })

  test("shows session title when sidebar is expanded", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "Adding dark mode toggle",
      chatStatus: "idle",
    })

    expect(html).toContain("Adding dark mode toggle")
    expect(html).toContain('data-testid="session-summary"')
  })

  test("session title is more compact on mobile when sidebar is expanded", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "Adding dark mode toggle",
      chatStatus: "running",
    })

    expect(html).toContain('data-testid="session-summary"')
    expect(html).toContain("max-md:max-w-[120px]")
  })

  test("shows status dot for running session", () => {
    const html = renderNavbar({
      sidebarCollapsed: true,
      ...defaultProps,
      chatTitle: "Fix authentication bug",
      chatStatus: "running",
    })

    expect(html).toContain('data-testid="session-summary"')
    expect(html).toContain('data-status="running"')
  })

  test("shows status dot for waiting_for_user", () => {
    const html = renderNavbar({
      sidebarCollapsed: true,
      ...defaultProps,
      chatTitle: "Refactoring API",
      chatStatus: "waiting_for_user",
    })

    expect(html).toContain('data-status="waiting_for_user"')
  })

  test("hides session summary when no chatTitle", () => {
    const html = renderNavbar({
      sidebarCollapsed: true,
      ...defaultProps,
    })

    expect(html).not.toContain('data-testid="session-summary"')
  })
})

describe("getContextBarColor", () => {
  test("returns green for 0-49%", () => {
    expect(getContextBarColor(0)).toContain("emerald")
    expect(getContextBarColor(25)).toContain("emerald")
    expect(getContextBarColor(49)).toContain("emerald")
  })

  test("returns amber for 50-74%", () => {
    expect(getContextBarColor(50)).toContain("amber")
    expect(getContextBarColor(74)).toContain("amber")
  })

  test("returns orange for 75-89%", () => {
    expect(getContextBarColor(75)).toContain("orange")
    expect(getContextBarColor(89)).toContain("orange")
  })

  test("returns red for 90-100%", () => {
    expect(getContextBarColor(90)).toContain("red")
    expect(getContextBarColor(100)).toContain("red")
  })
})

describe("getContextPercentTextColor", () => {
  test("returns muted for low usage", () => {
    expect(getContextPercentTextColor(25)).toContain("muted")
  })

  test("returns red for critical usage", () => {
    expect(getContextPercentTextColor(95)).toContain("red")
  })
})
