import { describe, expect, test } from "bun:test"
import type { TranscriptEntry } from "../shared/types"
import type { HarnessTurn } from "./harness-types"
import { startCodexTurn, type CodexHarnessBinding } from "./codex-harness"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  } as TranscriptEntry
}

function createHarnessTurn(): HarnessTurn {
  async function* stream() {
    yield {
      type: "transcript" as const,
      entry: timestamped({
        kind: "system_init",
        provider: "codex",
        model: "gpt-5.4",
        tools: [],
        agents: [],
        slashCommands: [],
        mcpServers: [],
      }),
    }
    yield {
      type: "transcript" as const,
      entry: timestamped({
        kind: "result",
        subtype: "success",
        isError: false,
        durationMs: 0,
        result: "",
      }),
    }
  }

  return {
    provider: "codex",
    stream: stream(),
    interrupt: async () => {},
    close: () => {},
  }
}

describe("startCodexTurn", () => {
  test("composes the Codex session-start and turn-start boundary in one controlled harness call", async () => {
    const sessionCalls: Array<Record<string, unknown>> = []
    const turnCalls: Array<Record<string, unknown>> = []
    const binding: CodexHarnessBinding = {
      async startSession(args) {
        sessionCalls.push(args as unknown as Record<string, unknown>)
      },
      async startTurn(args) {
        turnCalls.push(args as unknown as Record<string, unknown>)
        return createHarnessTurn()
      },
      stopSession() {},
    }

    const turn = await startCodexTurn({
      binding,
      chatId: "chat-1",
      projectId: "project-1",
      localPath: "/tmp/project",
      content: "Delegated task:\nWrite the patch",
      model: "gpt-5.4",
      effort: "high",
      serviceTier: "fast",
      planMode: false,
      skills: ["frontend-design"],
      sessionToken: "thread-1",
      onToolRequest: async () => ({}),
      orchestrationChatId: "chat-1",
      orchestrator: { listAgents() { return { children: [] } } } as never,
    })

    expect(sessionCalls).toEqual([{
      chatId: "chat-1",
      projectId: "project-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      serviceTier: "fast",
      sessionToken: "thread-1",
    }])
    expect(turnCalls).toEqual([{
      chatId: "chat-1",
      content: "Delegated task:\nWrite the patch",
      model: "gpt-5.4",
      effort: "high",
      serviceTier: "fast",
      planMode: false,
      skills: ["frontend-design"],
      orchestrator: expect.any(Object),
      orchestrationChatId: "chat-1",
      onToolRequest: expect.any(Function),
    }])

    const events: unknown[] = []
    for await (const event of turn.stream) {
      events.push(event)
    }
    expect(events).toHaveLength(2)
  })

  test("propagates startSession failures without hiding the provider error", async () => {
    const binding: CodexHarnessBinding = {
      async startSession() {
        throw new Error("thread/resume failed: thread is not rollable")
      },
      async startTurn() {
        throw new Error("should not be called")
      },
      stopSession() {},
    }

    await expect(startCodexTurn({
      binding,
      chatId: "chat-1",
      projectId: "project-1",
      localPath: "/tmp/project",
      content: "hello",
      model: "gpt-5.4",
      planMode: false,
      sessionToken: null,
      onToolRequest: async () => ({}),
    })).rejects.toThrow("thread/resume failed: thread is not rollable")
  })
})
