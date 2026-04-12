import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../components/ui/tooltip"
import { areAppSidebarPropsEqual, getSidebarUiIdentityDescriptor, AppSidebar } from "./AppSidebar"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import type { SidebarData, UpdateSnapshot } from "../../shared/types"

// Pre-warm lazy chunks so renderToStaticMarkup can resolve them synchronously
await import("../components/chat-ui/sidebar/LocalProjectsSection")

function createSidebarData(): SidebarData {
  return { workspaceGroups: [], independentWorkspaces: [] }
}

function renderSidebar(overrides: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(TooltipProvider, null,
      createElement(MemoryRouter, null, createElement(AppSidebar, {
        data: createSidebarData(),
        activeChatId: null,
        connectionStatus: "connected",
        ready: true,
        open: true,
        collapsed: false,
        showMobileOpenButton: false,
        onOpen: () => {},
        onClose: () => {},
        onCollapse: () => {},
        onExpand: () => {},
        onCreateChat: () => {},
        onDeleteChat: () => {},
        onRenameChat: () => {},
        onRemoveProject: () => {},
        updateSnapshot: null as UpdateSnapshot | null,
        onInstallUpdate: () => {},
        sessionsForProject: () => [],
        sessionsWindowDaysForProject: () => 7,
        onOpenSessionPicker: () => {},
        onResumeSession: () => {},
        onRefreshSessions: () => {},
        onShowMoreSessions: () => {},
        ...overrides,
      }))
    )
  )
}

function createSidebarProps(overrides: Partial<Parameters<typeof AppSidebar>[0]> = {}): Parameters<typeof AppSidebar>[0] {
  return {
    data: createSidebarData(),
    activeChatId: null,
    connectionStatus: "connected",
    ready: true,
    open: true,
    collapsed: false,
    showMobileOpenButton: false,
    onOpen: () => {},
    onClose: () => {},
    onCollapse: () => {},
    onExpand: () => {},
    onCreateChat: () => {},
    onDeleteChat: () => {},
    onRenameChat: () => {},
    onRemoveProject: () => {},
    updateSnapshot: null as UpdateSnapshot | null,
    onInstallUpdate: () => {},
    sessionsForProject: () => [],
    sessionsWindowDaysForProject: () => 7,
    onOpenSessionPicker: () => {},
    onResumeSession: () => {},
    onRefreshSessions: () => {},
    onShowMoreSessions: () => {},
    ...overrides,
  }
}

describe("AppSidebar", () => {
  test("exposes a C3-owned sidebar shell descriptor", () => {
    expect(getUiIdentityAttributeProps(getSidebarUiIdentityDescriptor())).toEqual({
      "data-ui-id": "chat.sidebar",
      "data-ui-c3": "c3-113",
      "data-ui-c3-label": "sidebar",
    })
  })

  test("renders the sidebar header", () => {
    const html = renderSidebar()
    expect(html).toContain("font-logo")
    expect(html).toContain("Tinkaria")
    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).toContain("title=\"Home\"")
    expect(html).toContain("aria-label=\"Go to homepage\"")
    expect(html).toContain('data-ui-id="chat.sidebar"')
    expect(html).toContain('data-ui-c3="c3-113"')
    expect(html).toContain('data-ui-c3-label="sidebar"')
  })

  test("renders the collapsed utility stub with an expand action", () => {
    const html = renderSidebar({
      collapsed: true,
      open: false,
    })

    expect(html).toContain("group/desktop-collapsed-shell")
    expect(html).toContain("title=\"Expand sidebar\"")
    expect(html).toContain("tinkaria-mark-fine.svg")
  })

  test("renders the chat model indicator and provider glyph without inline chat-row action buttons", () => {
    const html = renderSidebar({
      data: {
        independentWorkspaces: [],
        workspaceGroups: [
          {
            groupKey: "project-1",
            localPath: "/tmp/demo",
            chats: [{
              _id: "chat-1",
              _creationTime: 1,
              chatId: "chat-1",
              title: "Demo chat",
              status: "idle",
              localPath: "/tmp/demo",
              provider: "codex",
              model: "gpt-5.4",
              unread: false,
              lastMessageAt: 1,
              hasAutomation: false,
            }],
          },
        ],
      },
    })

    expect(html).toContain("gpt-5.4")
    expect(html).toContain('title="Codex"')
    expect(html).not.toContain('title="Chat actions"')
  })

  test("keeps project-group actions inside the hold menu instead of rendering inline buttons", () => {
    const html = renderSidebar({
      data: {
        workspaceGroups: [
          {
            groupKey: "project-1",
            localPath: "/tmp/demo",
            chats: [],
          },
        ],
      },
      onMergeSession: () => {},
    })

    expect(html).toContain('data-ui-id="sidebar.project-group"')
    expect(html).not.toContain('data-ui-id="sidebar.project-group.sessions.action"')
    expect(html).not.toContain("aria-label=\"Coordination board\"")
    expect(html).not.toContain("Merge sessions")
  })

  test("ignores handler identity churn when sidebar data is unchanged", () => {
    const previous = createSidebarProps({
      data: {
        independentWorkspaces: [],
        workspaceGroups: [
          {
            groupKey: "project-1",
            localPath: "/tmp/demo",
            chats: [],
          },
        ],
      },
      sessionsForProject: () => [{
        sessionId: "session-1",
        provider: "codex",
        source: "cli",
        title: "Demo session",
        lastExchange: null,
        modifiedAt: 1,
        chatId: null,
        runtime: { model: "gpt-5.4" },
      }],
    })
    const next = createSidebarProps({
      ...previous,
      onOpen: () => {},
      onClose: () => {},
      onCreateChat: () => {},
      onDeleteChat: () => {},
      onRenameChat: () => {},
      onRemoveProject: () => {},
      onInstallUpdate: () => {},
      onOpenSessionPicker: () => {},
      onResumeSession: () => {},
      onRefreshSessions: () => {},
      onShowMoreSessions: () => {},
      onMergeSession: () => {},
      sessionsForProject: () => [{
        sessionId: "session-1",
        provider: "codex",
        source: "cli",
        title: "Demo session",
        lastExchange: null,
        modifiedAt: 1,
        chatId: null,
        runtime: { model: "gpt-5.4" },
      }],
    })

    expect(areAppSidebarPropsEqual(previous, next)).toBe(true)
  })
})
