import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "./ui/tooltip"
import {
  LocalDev,
  getLocalProjectsPageUiIdentityDescriptors,
  getLocalProjectsPageUiIdentities,
  getHomepageRecentSessions,
  getSortedHomepageProjects,
} from "./LocalDev"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"

describe("getSortedHomepageProjects", () => {
  test("orders homepage projects by most recently opened first", () => {
    expect(getSortedHomepageProjects({
      machine: { id: "local", displayName: "Local Projects" },
      projects: [
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
      projects: [
        { localPath: "/tmp/alpha", title: "Alpha", source: "saved", chatCount: 1, lastOpenedAt: 2 },
        { localPath: "/tmp/beta", title: "Beta", source: "discovered", chatCount: 3, lastOpenedAt: 4 },
      ],
    }, (projectId) => {
      if (projectId === "/tmp/alpha") {
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
      projects: [
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
    })

    expect(identities).not.toHaveProperty("stats")
  })

  test("renders session-centric homepage with action-first project cards and overview panel", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <LocalDev
          connectionStatus="connected"
          ready
          snapshot={{
            machine: {
              id: "local",
              displayName: "Local Projects",
            },
            projects: [
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
          sessionsForProject={(projectId) => {
            if (projectId === "/workspace/alpha") {
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
    )

    // Session-centric: recent sessions section is present
    expect(html).toContain('data-ui-id="home.page"')
    expect(html).toContain('data-ui-id="home.header"')
    expect(html).toContain('data-ui-id="home.recent-sessions"')
    expect(html).toContain('data-ui-id="home.recent-session-card"')
    expect(html).toContain("Fix homepage copy")
    expect(html).toContain("Investigate desktop shell")

    // Workspaces remain, but now as action-first cards with overview support
    expect(html).toContain('data-ui-id="home.workspace-grid"')
    expect(html).toContain('data-ui-id="home.add-project.action"')
    expect(html).toContain('data-ui-id="home.project-card"')
    expect(html).toContain('data-ui-id="home.project-overview"')
    expect(html).toContain('data-ui-id="home.project-primary.action"')
    expect(html).toContain('data-ui-id="home.project-secondary.action"')
    expect(html).toContain("Alpha")
    expect(html).toContain("/workspace/alpha")
    expect(html).toContain("Active Project")
    expect(html).toContain("Why now")
    expect(html).toContain("Continue Fix homepage copy")
    expect(html).toContain("Start Fresh Task")
    expect(html).toContain("Overview")
    expect(html).toContain("already has momentum")
    expect(html).toContain("Pinned and ready")

    // Stats section is gone
    expect(html).not.toContain('data-ui-id="home.project-stats"')
    expect(html).not.toContain("Explicitly tracked projects")
    expect(html).not.toContain("Projects picked up from usage")
    expect(html).not.toContain("Workspaces available on this machine")
  })

  test("renders a clearer disconnected setup state with next steps", () => {
    const html = renderToStaticMarkup(
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
    )

    expect(html).toContain("Local Tinkaria server not reachable")
    expect(html).toContain("Get Connected")
    expect(html).toContain("Start Tinkaria locally")
    expect(html).toContain("Already running?")
  })
})
