import { afterEach, describe, expect, mock, test } from "bun:test"
import type { TranscriptEntry } from "../shared/types"

const queryMock = mock(() => {
  throw new Error("query() should not be used for Claude bootstrap")
})

const startupMock = mock(async () => {
  throw new Error("resume failed: session not found")
})

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
  startup: startupMock,
  createSdkMcpServer: mock(() => ({ type: "sdk", name: "mock", instance: {} })),
  tool: mock(() => ({})),
}))

const { AgentCoordinator } = await import("./agent")

function createFakeStore() {
  const chat = {
    id: "chat-1",
    projectId: "project-1",
    title: "New Chat",
    provider: null as "claude" | "codex" | null,
    model: null as string | null,
    planMode: false,
    sessionToken: "stale-claude-session" as string | null,
  }
  const project = {
    id: "project-1",
    localPath: "/tmp/project",
  }
  const messages: TranscriptEntry[] = []
  const failedMessages: string[] = []

  return {
    chat,
    messages,
    failedMessages,
    requireChat(chatId: string) {
      expect(chatId).toBe("chat-1")
      return chat
    },
    getProject(projectId: string) {
      expect(projectId).toBe("project-1")
      return project
    },
    getMessages() {
      return messages
    },
    async setChatProvider(_chatId: string, provider: "claude" | "codex") {
      chat.provider = provider
    },
    async setChatModel(_chatId: string, model: string) {
      chat.model = model
    },
    async setPlanMode(_chatId: string, planMode: boolean) {
      chat.planMode = planMode
    },
    async renameChat(_chatId: string, title: string) {
      chat.title = title
    },
    async appendMessage(_chatId: string, entry: TranscriptEntry) {
      messages.push(entry)
    },
    async recordTurnStarted() {},
    async recordTurnFinished() {
      throw new Error("Did not expect turn success")
    },
    async recordTurnFailed(_chatId: string, error: string) {
      failedMessages.push(error)
    },
    async recordTurnCancelled() {},
    async setSessionToken(_chatId: string, sessionToken: string | null) {
      chat.sessionToken = sessionToken
    },
    async createChat() {
      return chat
    },
  }
}

afterEach(() => {
  queryMock.mockClear()
  startupMock.mockClear()
  mock.restore()
})

describe("AgentCoordinator Claude startup failures", () => {
  test("records a visible error result when Claude startup fails before the provider turn begins", async () => {
    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      generateTitle: async () => null,
    })

    await expect(coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "claude",
      content: "continue the delegated task",
      model: "claude-sonnet-4-5",
    })).resolves.toEqual({ chatId: "chat-1" })

    expect(startupMock).toHaveBeenCalledTimes(1)
    expect(queryMock).not.toHaveBeenCalled()
    expect(store.messages[0]).toMatchObject({ kind: "user_prompt", content: "continue the delegated task" })
    expect(store.messages[1]).toMatchObject({
      kind: "result",
      isError: true,
      result: "resume failed: session not found",
    })
    expect(store.failedMessages).toEqual(["resume failed: session not found"])
  })
})
