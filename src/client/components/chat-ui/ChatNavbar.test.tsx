import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { TooltipProvider } from "../ui/tooltip"
import {
  ChatNavbar,
  getChatNavbarUiIdentityDescriptors,
  getContextBarColor,
  getContextPercentTextColor,
} from "./ChatNavbar"

function renderNavbar(props: Parameters<typeof ChatNavbar>[0]) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ChatNavbar {...props} />
    </TooltipProvider>,
  )
}

/** Returns the HTML region preceding a data-testid or title marker */
function htmlBefore(html: string, marker: string): string {
  const idx = html.indexOf(marker)
  expect(idx).toBeGreaterThan(-1)
  return html.slice(0, idx)
}

function htmlElementForMarker(html: string, marker: string): string {
  const idx = html.indexOf(marker)
  expect(idx).toBeGreaterThan(-1)
  const start = html.lastIndexOf("<", idx)
  const end = html.indexOf(">", idx)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(-1)
  return html.slice(start, end + 1)
}

const defaultProps = {
  onOpenSidebar: () => {},
  onCollapseSidebar: () => {},
  onExpandSidebar: () => {},
  onForkSession: () => {},
  onMergeSession: () => {},
} as const

const cleanRepoStatus = {
  localPath: "/workspace/kanna",
  branch: "main",
  stagedCount: 0,
  unstagedCount: 0,
  untrackedCount: 0,
  ahead: 0,
  behind: 0,
  isRepo: true,
} as const

describe("ChatNavbar", () => {
  test("backs navbar grab targets with C3-owned descriptors", () => {
    const descriptors = getChatNavbarUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.root)).toEqual({
      "data-ui-id": "chat.navbar",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
    expect(getUiIdentityAttributeProps(descriptors.area)).toEqual({
      "data-ui-id": "chat.navbar.area",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
    expect(getUiIdentityAttributeProps(descriptors.forkSessionAction)).toEqual({
      "data-ui-id": "chat.navbar.fork-session.action",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
    expect(getUiIdentityAttributeProps(descriptors.mergeSessionAction)).toEqual({
      "data-ui-id": "chat.navbar.merge-session.action",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
  })

  test("pill has no branding mark — consistent width regardless of sidebar state", () => {
    const collapsed = renderNavbar({ sidebarCollapsed: true, ...defaultProps })
    const expanded = renderNavbar({ sidebarCollapsed: false, ...defaultProps })

    expect(collapsed).not.toContain("tinkaria-mark")
    expect(expanded).not.toContain("tinkaria-mark")
  })

  test("renders a fork-session button", () => {
    const html = renderNavbar({ sidebarCollapsed: false, ...defaultProps })

    expect(html).toContain('data-ui-c3="c3-112"')
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

  test("session title renders without aggressive mobile truncation constraint", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "Adding dark mode toggle",
      chatStatus: "running",
    })

    expect(html).toContain('data-testid="session-summary"')
    expect(html).not.toContain("max-md:max-w-[120px]")
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

  test("fork and merge buttons are hidden on mobile by default", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
    })

    expect(htmlBefore(html, 'title="Fork session"')).toContain("hidden md:")
    expect(htmlBefore(html, 'title="Merge sessions"')).toContain("hidden md:")
  })

  test("mobile expand toggle is visible on mobile, hidden on desktop", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
    })

    const expandElement = htmlElementForMarker(html, 'data-testid="mobile-navbar-toggle"')
    expect(expandElement).toContain("md:hidden")
  })

  test("sidebar toggle is available separately from mobile expand", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
    })

    // Desktop sidebar toggle (PanelLeft) should exist
    expect(html).toContain('title="Collapse sidebar"')
    // Mobile expand toggle should exist
    expect(html).toContain('data-testid="mobile-navbar-toggle"')
  })

  test("right pill content is hidden on mobile", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      localPath: "/workspace/kanna",
      currentRepoStatus: cleanRepoStatus,
      currentSessionRuntime: {
        model: "claude-sonnet-4-5",
        tokenUsage: { totalTokens: 1000, estimatedContextPercent: 25 },
      },
    })

    expect(htmlBefore(html, 'data-testid="context-bar"')).toContain("hidden md:")
  })

  test("renders mobile info row with repo label and context bar", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      localPath: "/workspace/kanna",
      currentRepoStatus: cleanRepoStatus,
      currentSessionRuntime: {
        model: "claude-sonnet-4-5",
        tokenUsage: { totalTokens: 1000, estimatedContextPercent: 25 },
      },
    })

    expect(html).toContain('data-testid="mobile-info-row"')
    const mobileRow = htmlElementForMarker(html, 'data-testid="mobile-info-row"')
    expect(mobileRow).toContain("md:hidden")
  })

  test("mobile info row shows repo label", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      localPath: "/workspace/kanna",
      currentRepoStatus: {
        ...cleanRepoStatus,
        branch: "feat/mobile",
        ahead: 2,
      },
    })

    expect(html).toContain('data-testid="mobile-info-row"')
    // The mobile row should contain the compact label
    const afterMobileRow = html.slice(html.indexOf('data-testid="mobile-info-row"'))
    expect(afterMobileRow).toContain("kanna")
    expect(afterMobileRow).toContain("feat/mobile +2")
  })

  test("mobile info row shows context percentage", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      localPath: "/workspace/kanna",
      currentRepoStatus: cleanRepoStatus,
      currentSessionRuntime: {
        model: "claude-sonnet-4-5",
        tokenUsage: { totalTokens: 5000, estimatedContextPercent: 72 },
      },
    })

    const afterMobileRow = html.slice(html.indexOf('data-testid="mobile-info-row"'))
    expect(afterMobileRow).toContain("72%")
  })

  test("mobile info row is hidden when no right content", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
    })

    expect(html).not.toContain('data-testid="mobile-info-row"')
  })

  test("uses no text smaller than 12px", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "Some title",
      chatStatus: "running",
      localPath: "/workspace/kanna",
      currentRepoStatus: cleanRepoStatus,
      currentSessionRuntime: {
        model: "claude-sonnet-4-5",
        tokenUsage: { totalTokens: 1000, estimatedContextPercent: 25 },
      },
    })

    expect(html).not.toContain("text-[10px]")
    expect(html).not.toContain("text-[11px]")
  })

  test("status dot is at least size-2", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "Fix bug",
      chatStatus: "running",
    })

    expect(html).toContain("size-2 shrink-0 rounded-full")
    expect(html).not.toContain("size-1.5 shrink-0 rounded-full")
  })

  test("session title has title attribute for truncation accessibility", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "A very long session title that will be truncated",
      chatStatus: "idle",
    })

    expect(html).toContain('title="A very long session title that will be truncated"')
  })

  test("session title has background on mobile for visibility", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      chatTitle: "Some title",
      chatStatus: "idle",
    })

    const summaryElement = htmlElementForMarker(html, 'data-testid="session-summary"')
    expect(summaryElement).toContain("max-md:bg-")
    expect(summaryElement).toContain("max-md:backdrop-blur")
  })

  test("model indicator is always visible (not hidden on mobile)", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: { model: "claude-sonnet-4-5" },
    })

    expect(htmlElementForMarker(html, 'data-testid="model-indicator"')).not.toContain("hidden md:")
  })

  test("falls back to runtimeModel when currentSessionRuntime has no model", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: null,
      runtimeModel: "opus",
      runtimeProvider: "claude",
    })

    expect(html).toContain('data-testid="model-indicator"')
    // Anthropic icon viewbox for claude provider
    expect(html).toContain('viewBox="0 0 24 24"')
  })

  test("prefers polled model over runtimeModel when both available", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: { model: "gpt-5.4" },
      runtimeModel: "opus",
      runtimeProvider: "claude",
    })

    expect(html).toContain('data-testid="model-indicator"')
    // Should use polled model (OpenAI icon for gpt-5.4), not runtimeModel
    expect(html).toContain('viewBox="0 0 158.7128 157.296"')
  })

  test("hides model indicator when neither source provides a model", () => {
    const html = renderNavbar({
      sidebarCollapsed: false,
      ...defaultProps,
      currentSessionRuntime: null,
      runtimeModel: null,
      runtimeProvider: null,
    })

    expect(html).not.toContain('data-testid="model-indicator"')
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
