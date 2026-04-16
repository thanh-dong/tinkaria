import { beforeEach, describe, expect, test } from "bun:test"

// Guard against prior tests wiping browser globals (order-dependent in full suite)
function ensureBrowserGlobals() {
  if (typeof globalThis.window !== "undefined") {
    if (!globalThis.window.matchMedia) {
      globalThis.window.matchMedia = (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
    }
    if (!globalThis.window.localStorage) {
      const store = new Map<string, string>()
      Object.defineProperty(globalThis.window, "localStorage", {
        value: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
          removeItem: (k: string) => store.delete(k),
          clear: () => store.clear(),
          get length() { return store.size },
          key: (i: number) => [...store.keys()][i] ?? null,
        },
        writable: true, configurable: true,
      })
    }
  }
}
ensureBrowserGlobals()
beforeEach(ensureBrowserGlobals)
import { renderToStaticMarkup } from "react-dom/server"
import { ThemeProvider } from "../hooks/useTheme"
import { TooltipProvider } from "./ui/tooltip"
import {
  LocalDev,
  getLocalProjectsPageUiIdentityDescriptors,
  getLocalProjectsPageUiIdentities,
  getSortedHomepageProjects,
} from "./LocalDev"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"

describe("getSortedHomepageProjects", () => {
  test("orders homepage projects by most recently opened first", () => {
    expect(getSortedHomepageProjects({
      machine: { id: "local", displayName: "Local Projects" },
      workspaces: [
        { localPath: "/tmp/alpha", title: "Alpha", source: "saved", chatCount: 1, lastOpenedAt: 2 },
        { localPath: "/tmp/gamma", title: "Gamma", source: "saved", chatCount: 0 },
        { localPath: "/tmp/beta", title: "Beta", source: "discovered", chatCount: 3, lastOpenedAt: 4 },
      ],
    }).map((project) => project.title)).toEqual(["Beta", "Alpha", "Gamma"])
  })
})

describe("LocalDev homepage", () => {
  test("backs each homepage screen identity with a C3-owned descriptor", () => {
    const descriptors = getLocalProjectsPageUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.page)).toEqual({
      "data-ui-id": "home.page",
      "data-ui-c3": "c3-117",
      "data-ui-c3-label": "projects",
    })
    expect(getUiIdentityAttributeProps(descriptors.newProjectDialog)).toEqual({
      "data-ui-id": "home.add-project.dialog",
      "data-ui-c3": "c3-117",
      "data-ui-c3-label": "projects",
    })
  })

  test("exposes stable ui identities for the homepage screen map", () => {
    const identities = getLocalProjectsPageUiIdentities()

    expect(identities).toEqual({
      page: "home.page",
      header: "home.header",
      tabs: "home.tabs",
      status: "home.status",
      setup: "home.setup",
      settingsPanel: "home.settings.panel",
      workspaceGrid: "home.workspace-grid",
      addProjectAction: "home.add-project.action",
      projectOverview: "home.project-overview",
      projectCard: "home.project-card",
      projectPrimaryAction: "home.project-primary.action",
      projectSecondaryAction: "home.project-secondary.action",
      newProjectDialog: "home.add-project.dialog",
      preferences: "home.preferences",
    })
  })

  test("renders homepage with project cards and overview panel", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
      <TooltipProvider>
        <LocalDev
          connectionStatus="connected"
          ready
          snapshot={{
            machine: {
              id: "local",
              displayName: "Local Projects",
            },
            workspaces: [
              {
                localPath: "/workspace/alpha",
                title: "Alpha",
                source: "saved",
                lastOpenedAt: 5,
                chatCount: 2,
              },
              {
                localPath: "/workspace/beta",
                title: "Beta",
                source: "saved",
                lastOpenedAt: 4,
                chatCount: 4,
              },
            ],
          }}
          startingLocalPath={null}
          commandError={null}
          onOpenProject={async () => {}}
          onCreateProject={async () => {}}
          projectGroups={[{
            groupKey: "alpha",
            localPath: "/workspace/alpha",
            chats: [
              {
                _id: "chat-1",
                _creationTime: 1,
                chatId: "chat-1",
                title: "Running checks",
                status: "running",
                unread: false,
                localPath: "/workspace/alpha",
                provider: "codex",
                model: "gpt-5.4",
                hasAutomation: false,
                lastMessageAt: 12,
              },
              {
                _id: "chat-2",
                _creationTime: 2,
                chatId: "chat-2",
                title: "Waiting review",
                status: "waiting_for_user",
                unread: true,
                localPath: "/workspace/alpha",
                provider: "claude",
                model: "sonnet",
                hasAutomation: false,
                lastMessageAt: 11,
              },
            ],
          }]}
          onOpenProjectPage={() => {}}
        />
      </TooltipProvider>
      </ThemeProvider>
    )

    expect(html).toContain('data-ui-id="home.page"')
    expect(html).toContain('data-ui-id="home.header"')
    expect(html).toContain('data-ui-id="home.tabs"')
    expect(html).toContain(">Projects<")
    expect(html).toContain(">Workspaces<")
    expect(html).toContain(">Settings<")

    // Projects: cards link to project pages and preview a couple current sessions.
    expect(html).toContain('data-ui-id="home.workspace-grid"')
    expect(html).toContain('data-ui-id="home.add-project.action"')
    expect(html).toContain('data-ui-id="home.project-card"')
    expect(html).toContain('data-ui-id="home.project-overview"')
    expect(html).toContain('data-ui-id="home.project-primary.action"')
    expect(html).toContain('data-ui-id="home.project-secondary.action"')
    expect(html).toContain('href="/project/alpha"')
    expect(html).toContain("Running checks")
    expect(html).toContain("Waiting review")
    expect(html).toContain("Alpha")
    expect(html).toContain("/workspace/alpha")

    // Entrance animation applied to cards and overview
    expect(html).toContain("animate-homepage-enter")
  })

  test("renders combined settings inside the home page", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
      <TooltipProvider>
        <LocalDev
          connectionStatus="connected"
          ready
          snapshot={{
            machine: { id: "local", displayName: "Local Projects" },
            workspaces: [],
          }}
          startingLocalPath={null}
          commandError={null}
          onOpenProject={async () => {}}
          onCreateProject={async () => {}}
          activeTab="settings"
          onActiveTabChange={() => {}}
          settingsPanel={<div data-testid="settings-slot">Unified settings</div>}
        />
      </TooltipProvider>
      </ThemeProvider>
    )

    expect(html).toContain('data-ui-id="home.settings.panel"')
    expect(html).toContain("Unified settings")
    expect(html).toContain("Home settings")
  })

  test("prioritizes project-page-linked projects on the homepage", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
      <TooltipProvider>
        <LocalDev
          connectionStatus="connected"
          ready
          snapshot={{
            machine: { id: "local", displayName: "Local Projects" },
            workspaces: [
              {
                localPath: "/workspace/unlinked",
                title: "Unlinked",
                source: "discovered",
                lastOpenedAt: 100,
                chatCount: 0,
              },
              {
                localPath: "/workspace/linked",
                title: "Linked",
                source: "saved",
                lastOpenedAt: 1,
                chatCount: 1,
              },
            ],
          }}
          projectGroups={[{ groupKey: "linked", localPath: "/workspace/linked", chats: [] }]}
          startingLocalPath={null}
          commandError={null}
          onOpenProject={async () => {}}
          onCreateProject={async () => {}}
          onOpenProjectPage={() => {}}
        />
      </TooltipProvider>
      </ThemeProvider>
    )

    expect(html.indexOf('href="/project/linked"')).toBeLessThan(html.indexOf("Unlinked"))
  })

  test("renders a clearer disconnected setup state with next steps", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
      <TooltipProvider>
        <LocalDev
          connectionStatus="disconnected"
          ready={false}
          snapshot={null}
          startingLocalPath={null}
          commandError="Can't reach your local Tinkaria server yet. Wait a moment, or start Tinkaria in a terminal on this machine and try again."
          onOpenProject={async () => {}}
          onCreateProject={async () => {}}
        />
      </TooltipProvider>
      </ThemeProvider>
    )

    expect(html).toContain("Local Tinkaria server not reachable")
    expect(html).toContain("Get Connected")
    expect(html).toContain("Start Tinkaria locally")
    expect(html).toContain("Already running?")
  })
})
