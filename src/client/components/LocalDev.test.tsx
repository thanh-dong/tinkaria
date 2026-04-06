import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "./ui/tooltip"
import {
  LocalDev,
  getHomepageProjectCounts,
  getHomepageRecentSessions,
  getSortedHomepageProjects,
} from "./LocalDev"

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
