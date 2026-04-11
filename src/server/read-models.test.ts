import { describe, expect, test } from "bun:test"
import { deriveChatSnapshot, deriveLocalWorkspacesSnapshot, deriveSidebarData } from "./read-models"
import { createEmptyState } from "./events"

describe("read models", () => {
  test("include provider and model data in sidebar rows", () => {
    const state = createEmptyState()
    state.workspacesById.set("project-1", {
      id: "project-1",
      localPath: "/tmp/project",
      title: "Project",
      createdAt: 1,
      updatedAt: 1,
    })
    state.workspaceIdsByPath.set("/tmp/project", "project-1")
    state.chatsById.set("chat-1", {
      id: "chat-1",
      workspaceId: "project-1",
    repoId: null,
      title: "Chat",
      createdAt: 1,
      updatedAt: 1,
      unread: false,
      provider: "codex",
      model: "gpt-5.4",
      planMode: false,
      sessionToken: "thread-1",
      lastTurnOutcome: null,
    })

    const sidebar = deriveSidebarData(state, new Map())
    expect(sidebar.workspaceGroups[0]?.chats[0]?.provider).toBe("codex")
    expect(sidebar.workspaceGroups[0]?.chats[0]?.model).toBe("gpt-5.4")
  })

  test("includes available providers in chat snapshots", () => {
    const state = createEmptyState()
    state.workspacesById.set("project-1", {
      id: "project-1",
      localPath: "/tmp/project",
      title: "Project",
      createdAt: 1,
      updatedAt: 1,
    })
    state.workspaceIdsByPath.set("/tmp/project", "project-1")
    state.chatsById.set("chat-1", {
      id: "chat-1",
      workspaceId: "project-1",
    repoId: null,
      title: "Chat",
      createdAt: 1,
      updatedAt: 1,
      unread: false,
      provider: "claude",
      planMode: true,
      sessionToken: "session-1",
      lastTurnOutcome: null,
    })

    const chat = deriveChatSnapshot(state, new Map(), "chat-1", 0)
    expect(chat?.runtime.provider).toBe("claude")
    expect(chat?.runtime.model).toBeNull()
    expect(chat?.availableProviders.length).toBeGreaterThan(1)
    expect(chat?.availableProviders.find((provider) => provider.id === "codex")?.models.map((model) => model.id)).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
    ])
  })

  test("includes available skills in chat snapshot when provided", () => {
    const state = createEmptyState()
    state.workspacesById.set("project-1", {
      id: "project-1",
      localPath: "/tmp/project",
      title: "Project",
      createdAt: 1,
      updatedAt: 1,
    })
    state.workspaceIdsByPath.set("/tmp/project", "project-1")
    state.chatsById.set("chat-1", {
      id: "chat-1",
      workspaceId: "project-1",
    repoId: null,
      title: "Chat",
      createdAt: 1,
      updatedAt: 1,
      unread: false,
      provider: "claude",
      planMode: false,
      sessionToken: null,
      lastTurnOutcome: null,
    })

    const chat = deriveChatSnapshot(state, new Map(), "chat-1", 0, ["skill-a", "skill-b"])
    expect(chat?.availableSkills).toEqual(["skill-a", "skill-b"])
  })

  test("includes the persisted chat model in chat runtime", () => {
    const state = createEmptyState()
    state.workspacesById.set("project-1", {
      id: "project-1",
      localPath: "/tmp/project",
      title: "Project",
      createdAt: 1,
      updatedAt: 1,
    })
    state.workspaceIdsByPath.set("/tmp/project", "project-1")
    state.chatsById.set("chat-1", {
      id: "chat-1",
      workspaceId: "project-1",
    repoId: null,
      title: "Chat",
      createdAt: 1,
      updatedAt: 1,
      unread: false,
      provider: "claude",
      model: "sonnet[1m]",
      planMode: false,
      sessionToken: "session-1",
      lastTurnOutcome: null,
    })

    const chat = deriveChatSnapshot(state, new Map(), "chat-1", 0)
    expect(chat?.runtime.model).toBe("sonnet[1m]")
  })

  test("defaults availableSkills to empty array when not provided", () => {
    const state = createEmptyState()
    state.workspacesById.set("project-1", {
      id: "project-1",
      localPath: "/tmp/project",
      title: "Project",
      createdAt: 1,
      updatedAt: 1,
    })
    state.workspaceIdsByPath.set("/tmp/project", "project-1")
    state.chatsById.set("chat-1", {
      id: "chat-1",
      workspaceId: "project-1",
    repoId: null,
      title: "Chat",
      createdAt: 1,
      updatedAt: 1,
      unread: false,
      provider: "claude",
      planMode: false,
      sessionToken: null,
      lastTurnOutcome: null,
    })

    const chat = deriveChatSnapshot(state, new Map(), "chat-1", 0)
    expect(chat?.availableSkills).toEqual([])
  })

  test("prefers saved project metadata over discovered entries for the same path", () => {
    const state = createEmptyState()
    state.workspacesById.set("project-1", {
      id: "project-1",
      localPath: "/tmp/project",
      title: "Saved Project",
      createdAt: 1,
      updatedAt: 50,
    })
    state.workspaceIdsByPath.set("/tmp/project", "project-1")
    state.chatsById.set("chat-1", {
      id: "chat-1",
      workspaceId: "project-1",
    repoId: null,
      title: "Chat",
      createdAt: 1,
      updatedAt: 75,
      unread: false,
      provider: "codex",
      planMode: false,
      sessionToken: null,
      lastMessageAt: 100,
      lastTurnOutcome: null,
    })

    const snapshot = deriveLocalWorkspacesSnapshot(state, [
      {
        localPath: "/tmp/project",
        title: "Discovered Project",
        modifiedAt: 10,
      },
    ], "Local Machine")

    expect(snapshot.workspaces).toEqual([
      {
        localPath: "/tmp/project",
        title: "Saved Project",
        source: "saved",
        lastOpenedAt: 100,
        chatCount: 1,
      },
    ])
  })
})
