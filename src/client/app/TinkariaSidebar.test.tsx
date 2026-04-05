import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../components/ui/tooltip"
import {
  getDesktopSidebarShellTitle,
  hasDesktopShellRuntime,
  shouldShowDesktopSidebarShellControls,
  TinkariaSidebar,
} from "./TinkariaSidebar"
import type { SidebarData, UpdateSnapshot } from "../../shared/types"

function createSidebarData(): SidebarData {
  return { projectGroups: [] }
}

function renderSidebar(overrides: Partial<Parameters<typeof TinkariaSidebar>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(TooltipProvider, null,
      createElement(MemoryRouter, null, createElement(TinkariaSidebar, {
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

function withDesktopWindow<T>(run: () => T): T {
  const originalWindow = globalThis.window
  ;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window =
    ({ __TAURI_INTERNALS__: {} } as unknown) as Window & typeof globalThis

  try {
    return run()
  } finally {
    ;(globalThis as typeof globalThis & { window?: unknown }).window = originalWindow
  }
}

describe("desktop sidebar shell helpers", () => {
  test("renders desktop header controls when the tauri runtime is present", () => {
    withDesktopWindow(() => {
      const html = renderSidebar()

      expect(html).toContain("data-tauri-drag-region")
      expect(html).toContain("group/sidebar-shell")
      expect(html).toContain("tinkaria-mark-fine.svg")
      expect(html).toContain('title="New project"')
    })
  })

  test("detects the tauri desktop runtime conservatively", () => {
    expect(hasDesktopShellRuntime({ __TAURI_INTERNALS__: {} })).toBe(true)
    expect(hasDesktopShellRuntime({})).toBe(false)
    expect(hasDesktopShellRuntime(null)).toBe(false)
  })

  test("shows sidebar shell controls only inside the tauri runtime", () => {
    expect(shouldShowDesktopSidebarShellControls({ __TAURI_INTERNALS__: {} })).toBe(true)
    expect(shouldShowDesktopSidebarShellControls(undefined)).toBe(false)
  })

  test("uses a stable desktop shell title", () => {
    expect(getDesktopSidebarShellTitle()).toBe("Tinkaria")
  })

  test("renders the sidebar header as the desktop control surface", () => {
    const html = withDesktopWindow(() => renderSidebar())

    expect(html).toContain("font-logo")
    expect(html).toContain("Tinkaria")
    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).toContain("title=\"New project\"")
  })

  test("renders desktop controls from the collapsed desktop stub", () => {
    withDesktopWindow(() => {
      const html = renderSidebar({
        collapsed: true,
        open: false,
      })

      expect(html).toContain("group/desktop-collapsed-shell")
      expect(html).toContain("title=\"Expand sidebar\"")
      expect(html).toContain("title=\"Toggle maximize\"")
      expect(html).toContain("title=\"Move window\"")
      expect(html).toContain("data-tauri-drag-region")
      expect(html).toContain("tinkaria-mark-fine.svg")
    })
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
