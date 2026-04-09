import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../components/ui/tooltip"
import { getSidebarUiIdentityDescriptor, AppSidebar } from "./AppSidebar"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import type { SidebarData, UpdateSnapshot } from "../../shared/types"

// Pre-warm lazy chunks so renderToStaticMarkup can resolve them synchronously
await import("../components/chat-ui/sidebar/LocalProjectsSection")

function createSidebarData(): SidebarData {
  return { projectGroups: [] }
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
    expect(html).toContain("title=\"Add project\"")
    expect(html).toContain("aria-label=\"Add project\"")
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

  test("renders the chat provider glyph next to the sidebar row menu", () => {
    const html = renderSidebar({
      data: {
        projectGroups: [
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
              unread: false,
              lastMessageAt: 1,
              hasAutomation: false,
            }],
          },
        ],
      },
    })

    expect(html).toContain('title="Codex"')
    expect(html).toContain('title="Chat actions"')
  })
})
