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
  getHomepageRecentSessions,
  getSortedHomepageProjects,
  getProjectSessionStats,
  getSessionStatus,
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

describe("getHomepageRecentSessions", () => {
  test("returns the most recent sessions across projects for welcome-back resume cards", () => {
    expect(getHomepageRecentSessions({
      machine: { id: "local", displayName: "Local Projects" },
      workspaces: [
        { localPath: "/tmp/alpha", title: "Alpha", source: "saved", chatCount: 1, lastOpenedAt: 2 },
        { localPath: "/tmp/beta", title: "Beta", source: "discovered", chatCount: 3, lastOpenedAt: 4 },
      ],
    }, (workspaceId) => {
      if (workspaceId === "/tmp/alpha") {
        return [{
          sessionId: "alpha-1",
          provider: "codex",
          source: "tinkaria",
          title: "Alpha session",
          lastExchange: null,
          modifiedAt: 5,
          chatId: "chat-alpha-1",
        }]
      }

      return [{
        sessionId: "beta-1",
        provider: "claude",
        source: "cli",
        title: "Beta session",
        lastExchange: null,
        modifiedAt: 9,
        chatId: null,
      }]
    }).map((item) => item.session.sessionId)).toEqual(["beta-1", "alpha-1"])
  })

  test("surfaces up to 5 recent sessions for the homepage", () => {
    const sessions = getHomepageRecentSessions({
      machine: { id: "local", displayName: "Local Projects" },
      workspaces: [
        { localPath: "/tmp/proj", title: "Proj", source: "saved", chatCount: 6, lastOpenedAt: 1 },
      ],
    }, () => Array.from({ length: 8 }, (_, i) => ({
      sessionId: `s-${i}`,
      provider: "claude" as const,
      source: "tinkaria" as const,
      title: `Session ${i}`,
      lastExchange: null,
      modifiedAt: 100 - i,
      chatId: `chat-${i}`,
    })))

    expect(sessions).toHaveLength(5)
    expect(sessions.map((s) => s.session.sessionId)).toEqual(["s-0", "s-1", "s-2", "s-3", "s-4"])
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

  test("exposes stable ui identities for the homepage screen map without stats", () => {
    const identities = getLocalProjectsPageUiIdentities()

    expect(identities).toEqual({
      page: "home.page",
      header: "home.header",
      status: "home.status",
      setup: "home.setup",
      recentSessions: "home.recent-sessions",
      workspaceGrid: "home.workspace-grid",
      addProjectAction: "home.add-project.action",
      projectOverview: "home.project-overview",
      projectCard: "home.project-card",
      projectPrimaryAction: "home.project-primary.action",
      projectSecondaryAction: "home.project-secondary.action",
      recentSessionCard: "home.recent-session-card",
      newProjectDialog: "home.add-project.dialog",
      preferences: "home.preferences",
    })

    expect(identities).not.toHaveProperty("stats")
  })

  test("renders session-centric homepage with action-first project cards and overview panel", () => {
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
          onNewChat={async () => {}}
          onCreateProject={async () => {}}
          sessionsForProject={(workspaceId) => {
            if (workspaceId === "/workspace/alpha") {
              return [{
                sessionId: "session-alpha",
                provider: "codex",
                source: "tinkaria",
                title: "Fix homepage copy",
                lastExchange: null,
                modifiedAt: Date.now() - 60_000,
                chatId: "chat-alpha",
              }]
            }

            return [{
              sessionId: "session-beta",
              provider: "claude",
              source: "cli",
              title: "Investigate desktop shell",
              lastExchange: null,
              modifiedAt: Date.now() - 120_000,
              chatId: null,
            }]
          }}
          onResumeSession={async () => {}}
        />
      </TooltipProvider>
      </ThemeProvider>
    )

    // Session-centric: recent sessions section is present
    expect(html).toContain('data-ui-id="home.page"')
    expect(html).toContain('data-ui-id="home.header"')
    expect(html).toContain('data-ui-id="home.recent-sessions"')
    expect(html).toContain('data-ui-id="home.recent-session-card"')
    expect(html).toContain("Fix homepage copy")
    expect(html).toContain("Investigate desktop shell")

    // Workspaces: clickable cards with actions revealed on hover/select
    expect(html).toContain('data-ui-id="home.workspace-grid"')
    expect(html).toContain('data-ui-id="home.add-project.action"')
    expect(html).toContain('data-ui-id="home.project-card"')
    expect(html).toContain('data-ui-id="home.project-overview"')
    expect(html).toContain('data-ui-id="home.project-primary.action"')
    expect(html).toContain('data-ui-id="home.project-secondary.action"')
    expect(html).toContain("Alpha")
    expect(html).toContain("/workspace/alpha")
    expect(html).toContain("Continue Fix homepage copy")
    expect(html).toContain("New Chat")

    // Preferences footer
    expect(html).toContain('data-ui-id="home.preferences"')

    // Entrance animation applied to cards and overview
    expect(html).toContain("animate-homepage-enter")

    // Cleanup: terse summaries, no filler prose
    expect(html).toContain("Last active")
    expect(html).not.toContain("already has momentum")
    expect(html).not.toContain("Best next move")
    expect(html).not.toContain("Orientation")
    expect(html).not.toContain("Active Project")
    expect(html).not.toContain("Why open this now")

    // Stats section is gone
    expect(html).not.toContain('data-ui-id="home.project-stats"')
    expect(html).not.toContain("Explicitly tracked projects")
    expect(html).not.toContain("Projects picked up from usage")
    expect(html).not.toContain("Workspaces available on this machine")
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
          onNewChat={async () => {}}
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

describe("getProjectSessionStats", () => {
  test("aggregates token usage and identifies dominant model", () => {
    const stats = getProjectSessionStats([
      { sessionId: "s1", provider: "claude", source: "tinkaria", title: "A", lastExchange: null, modifiedAt: 1, chatId: null, runtime: { model: "opus", tokenUsage: { totalTokens: 5000, estimatedContextPercent: 40 } } },
      { sessionId: "s2", provider: "claude", source: "cli", title: "B", lastExchange: null, modifiedAt: 2, chatId: null, runtime: { model: "opus", tokenUsage: { totalTokens: 3000, estimatedContextPercent: 60 } } },
      { sessionId: "s3", provider: "codex", source: "tinkaria", title: "C", lastExchange: null, modifiedAt: 3, chatId: null, runtime: { model: "gpt-5.4", tokenUsage: { totalTokens: 2000, estimatedContextPercent: 20 } } },
    ])

    expect(stats.totalTokens).toBe(10000)
    expect(stats.dominantModel).toBe("opus")
    expect(stats.avgContextPercent).toBe(40)
    expect(stats.sessionCount).toBe(3)
  })

  test("returns zero stats for empty sessions", () => {
    const stats = getProjectSessionStats([])
    expect(stats.totalTokens).toBe(0)
    expect(stats.dominantModel).toBeNull()
    expect(stats.avgContextPercent).toBeNull()
    expect(stats.sessionCount).toBe(0)
  })

  test("handles sessions with partial runtime data", () => {
    const stats = getProjectSessionStats([
      { sessionId: "s1", provider: "claude", source: "tinkaria", title: "A", lastExchange: null, modifiedAt: 1, chatId: null, runtime: { model: "sonnet" } },
      { sessionId: "s2", provider: "claude", source: "tinkaria", title: "B", lastExchange: null, modifiedAt: 2, chatId: null },
    ])

    expect(stats.totalTokens).toBe(0)
    expect(stats.dominantModel).toBe("sonnet")
    expect(stats.avgContextPercent).toBeNull()
    expect(stats.sessionCount).toBe(2)
  })
})

describe("getSessionStatus", () => {
  const NOW = 1_700_000_000_000

  test("returns context warning when latest session is near limit", () => {
    expect(getSessionStatus([
      { sessionId: "s1", provider: "claude", source: "tinkaria", title: "A", lastExchange: null, modifiedAt: NOW - 60_000, chatId: null, runtime: { tokenUsage: { totalTokens: 80000, estimatedContextPercent: 85 } } },
    ], NOW)).toBe("Context near limit")
  })

  test("returns Active when session within 24h", () => {
    expect(getSessionStatus([
      { sessionId: "s1", provider: "claude", source: "tinkaria", title: "A", lastExchange: null, modifiedAt: NOW - 3_600_000, chatId: null },
    ], NOW)).toBe("Active")
  })

  test("returns Stale when no session within 7 days", () => {
    expect(getSessionStatus([
      { sessionId: "s1", provider: "claude", source: "tinkaria", title: "A", lastExchange: null, modifiedAt: NOW - 8 * 86_400_000, chatId: null },
    ], NOW)).toBe("Stale")
  })

  test("returns No sessions for empty array", () => {
    expect(getSessionStatus([], NOW)).toBe("No sessions")
  })
})
