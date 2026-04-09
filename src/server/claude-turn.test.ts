import { afterEach, describe, expect, mock, test } from "bun:test"

const queryMock = mock(() => {
  throw new Error("query() should not be used for Claude bootstrap")
})

const warmQueryCalls: string[] = []
const interruptMock = mock(async () => {})
const closeMock = mock(() => {})
const accountInfoMock = mock(async () => null)
const contextUsageMock = mock(async () => null)

const startupMock = mock(async ({ options }: { options?: Record<string, unknown> } = {}) => ({
  query(prompt: string) {
    warmQueryCalls.push(prompt)
    return {
      async *[Symbol.asyncIterator]() {
        yield { session_id: "claude-session-1" }
        yield {
          type: "system",
          subtype: "init",
          session_id: "claude-session-1",
          model: options?.model ?? "claude-sonnet-4-5",
          tools: [],
          agents: [],
          slash_commands: [],
          mcp_servers: [],
        }
        yield {
          type: "result",
          subtype: "success",
          session_id: "claude-session-1",
          is_error: false,
          duration_ms: 1,
          result: "ok",
        }
      },
      accountInfo: accountInfoMock,
      getContextUsage: contextUsageMock,
      interrupt: interruptMock,
      close: closeMock,
    }
  },
  close: mock(() => {}),
}))

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
  startup: startupMock,
  createSdkMcpServer: mock(() => ({ type: "sdk", name: "mock", instance: {} })),
  tool: mock(() => ({})),
}))

const { startClaudeTurn } = await import("./agent")

async function collect(iterable: AsyncIterable<unknown>) {
  const items: unknown[] = []
  for await (const item of iterable) {
    items.push(item)
  }
  return items
}

afterEach(() => {
  queryMock.mockClear()
  startupMock.mockClear()
  interruptMock.mockClear()
  closeMock.mockClear()
  accountInfoMock.mockClear()
  contextUsageMock.mockClear()
  warmQueryCalls.length = 0
  mock.restore()
})

describe("startClaudeTurn", () => {
  test("bootstraps Claude turns through startup().query() so the first prompt is carried into fresh spawned sessions", async () => {
    const turn = await startClaudeTurn({
      content: "Delegated task:\nFix the regression",
      localPath: "/tmp/project",
      model: "claude-sonnet-4-5",
      planMode: false,
      sessionToken: null,
      onToolRequest: async () => ({}),
      chatId: "chat-1",
    })

    const events = await collect(turn.stream)

    expect(startupMock).toHaveBeenCalledTimes(1)
    expect(queryMock).not.toHaveBeenCalled()
    expect(warmQueryCalls).toEqual(["Delegated task:\nFix the regression"])
    expect(events.some((event) => (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as { type?: string }).type === "session_token"
    ))).toBe(true)
    expect(events.some((event) => (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as { type?: string; entry?: { kind?: string; provider?: string } }).type === "transcript" &&
      (event as { entry?: { kind?: string; provider?: string } }).entry?.kind === "system_init" &&
      (event as { entry?: { kind?: string; provider?: string } }).entry?.provider === "claude"
    ))).toBe(true)
    expect(events.some((event) => (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as { type?: string; entry?: { kind?: string; isError?: boolean; result?: string } }).type === "transcript" &&
      (event as { entry?: { kind?: string; isError?: boolean; result?: string } }).entry?.kind === "result" &&
      (event as { entry?: { kind?: string; isError?: boolean; result?: string } }).entry?.isError === false &&
      (event as { entry?: { kind?: string; isError?: boolean; result?: string } }).entry?.result === "ok"
    ))).toBe(true)

    await turn.interrupt()
    turn.close()
    expect(interruptMock).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
