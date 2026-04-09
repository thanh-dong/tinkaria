import { afterEach, describe, expect, mock, test } from "bun:test"
import { startClaudeTurn, type ClaudeSdkBinding } from "./claude-harness"

const warmQueryCalls: string[] = []
const directQueryCalls: Array<{ prompt: string; options?: Record<string, unknown> }> = []
const interruptMock = mock(async () => {})
const closeMock = mock(() => {})
const accountInfoMock = mock(async () => null)
const contextUsageMock = mock(async () => null)

function createQuery(model = "claude-sonnet-4-5") {
  return {
    async *[Symbol.asyncIterator]() {
      yield { session_id: "claude-session-1" }
      yield {
        type: "system",
        subtype: "init",
        session_id: "claude-session-1",
        model,
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
}

async function collect(iterable: AsyncIterable<unknown>) {
  const items: unknown[] = []
  for await (const item of iterable) {
    items.push(item)
  }
  return items
}

afterEach(() => {
  interruptMock.mockClear()
  closeMock.mockClear()
  accountInfoMock.mockClear()
  contextUsageMock.mockClear()
  warmQueryCalls.length = 0
  directQueryCalls.length = 0
})

describe("startClaudeTurn", () => {
  test("bootstraps Claude turns through startup().query() so the first prompt is carried into fresh spawned sessions", async () => {
    const sdk: ClaudeSdkBinding = {
      query() {
        throw new Error("query() should not be used for Claude bootstrap")
      },
      startup: mock(async ({ options }: { options?: Record<string, unknown> } = {}) => ({
        query(prompt: string) {
          warmQueryCalls.push(prompt)
          return createQuery((options?.model as string | undefined) ?? "claude-sonnet-4-5") as never
        },
      })),
    }

    const turn = await startClaudeTurn({
      content: "Delegated task:\nFix the regression",
      localPath: "/tmp/project",
      model: "claude-sonnet-4-5",
      planMode: false,
      sessionToken: null,
      onToolRequest: async () => ({}),
      chatId: "chat-1",
      sdk,
    })

    const events = await collect(turn.stream)

    expect(sdk.startup).toHaveBeenCalledTimes(1)
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

  test("falls back to direct query when startup() is unavailable", async () => {
    const sdk: ClaudeSdkBinding = {
      query(args) {
        directQueryCalls.push(args as unknown as { prompt: string; options?: Record<string, unknown> })
        return createQuery(args.options?.model ?? "claude-sonnet-4-5") as never
      },
    }

    const turn = await startClaudeTurn({
      content: "Direct bootstrap prompt",
      localPath: "/tmp/project",
      model: "claude-sonnet-4-5",
      planMode: false,
      sessionToken: null,
      onToolRequest: async () => ({}),
      sdk,
    })

    await collect(turn.stream)

    expect(directQueryCalls).toHaveLength(1)
    expect(directQueryCalls[0]?.prompt).toBe("Direct bootstrap prompt")
    expect(directQueryCalls[0]?.options?.cwd).toBe("/tmp/project")
  })
})
