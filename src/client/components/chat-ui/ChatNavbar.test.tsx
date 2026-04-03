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

  test("replaces compose with desktop shell controls in the desktop runtime", () => {
    const originalWindow = globalThis.window
    ;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window =
      ({ __TAURI_INTERNALS__: {} } as unknown) as Window & typeof globalThis

    try {
      const html = renderToStaticMarkup(
        <ChatNavbar
          sidebarCollapsed={false}
          onOpenSidebar={() => {}}
          onCollapseSidebar={() => {}}
          onExpandSidebar={() => {}}
          onNewChat={() => {}}
        />,
      )

      expect(html).not.toContain('title="Compose"')
      expect(html).toContain('title="Collapse sidebar"')
      expect(html).toContain('title="Move window"')
      expect(html).toContain('title="Toggle maximize"')
      expect(html).toContain('title="New project"')
    } finally {
      ;(globalThis as typeof globalThis & { window?: unknown }).window = originalWindow
    }
  })

  test("shows a single expand control and keeps new project in collapsed desktop runtime", () => {
    const originalWindow = globalThis.window
    ;(globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window =
      ({ __TAURI_INTERNALS__: {} } as unknown) as Window & typeof globalThis

    try {
      const html = renderToStaticMarkup(
        <ChatNavbar
          sidebarCollapsed
          onOpenSidebar={() => {}}
          onCollapseSidebar={() => {}}
          onExpandSidebar={() => {}}
          onNewChat={() => {}}
        />,
      )

      const expandMatches = html.match(/title="Expand sidebar"/g) ?? []
      expect(expandMatches.length).toBe(1)
      expect(html).toContain('title="New project"')
      expect(html).toContain('title="Move window"')
      expect(html).toContain('title="Toggle maximize"')
    } finally {
      ;(globalThis as typeof globalThis & { window?: unknown }).window = originalWindow
    }
  })
})
