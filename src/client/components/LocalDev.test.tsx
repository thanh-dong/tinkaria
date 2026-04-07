import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "./ui/tooltip"
import {
  LocalDev,
  getLocalProjectsPageUiIdentityDescriptors,
  getLocalProjectsPageUiIdentities,
  getHomepageProjectCounts,
  getHomepageRecentSessions,
  getSortedHomepageProjects,
} from "./LocalDev"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"

describe("getHomepageProjectCounts", () => {
  test("summarizes saved and discovered project totals for the homepage overview", () => {
    expect(getHomepageProjectCounts({
      machine: { id: "local", displayName: "Local Projects" },
      projects: [
        { localPath: "/tmp/beta", title: "Beta", source: "saved", chatCount: 3, lastOpenedAt: 4 },
        { localPath: "/tmp/alpha", title: "Alpha", source: "discovered", chatCount: 1, lastOpenedAt: 2 },
        { localPath: "/tmp/gamma", title: "Gamma", source: "saved", chatCount: 0 },
      ],
    })).toEqual({
      total: 3,
      saved: 2,
      discovered: 1,
    })
  })
})

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
    expect(getLocalProjectsPageUiIdentities()).toEqual({
      page: "home.page",
      header: "home.header",
      status: "home.status",
      setup: "home.setup",
      recentSessions: "home.recent-sessions",
      stats: "home.project-stats",
      workspaceGrid: "home.workspace-grid",
      addProjectAction: "home.add-project.action",
      projectCard: "home.project-card",
      recentSessionCard: "home.recent-session-card",
      newProjectDialog: "home.add-project.dialog",
    })
  })

  test("welcomes the user back with recent sessions before project stats", () => {
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

    expect(html).toContain("Welcome back")
    expect(html).toContain("Pick up where you left off")
    expect(html).toContain('data-ui-id="home.page"')
    expect(html).toContain('data-ui-c3="c3-117"')
    expect(html).toContain('data-ui-c3-label="projects"')
    expect(html).toContain('data-ui-id="home.header"')
    expect(html).toContain('data-ui-id="home.recent-sessions"')
    expect(html).toContain('data-ui-id="home.project-stats"')
    expect(html).toContain('data-ui-id="home.workspace-grid"')
    expect(html).toContain('data-ui-id="home.add-project.action"')
    expect(html).toContain('data-ui-id="home.recent-session-card"')
    expect(html).toContain('data-ui-id="home.project-card"')
    expect(html).toContain("Resume session")
    expect(html).toContain("Fix homepage copy")
    expect(html).toContain("Projects")
    expect(html).toContain("Workspaces")
    expect(html).toContain("Recent work first")
    expect(html).toContain("Alpha")
    expect(html).toContain("/workspace/alpha")
    expect(html).toContain("Saved")
    expect(html).toContain("2 chats")
    expect(html).not.toContain("Overview")
    expect(html).not.toContain("Desktop Smoke")
  })
})
