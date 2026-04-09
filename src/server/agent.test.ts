import { describe, expect, test } from "bun:test"
import { AgentCoordinator, normalizeClaudeStreamMessage } from "./agent"
import type { CodexRuntime } from "./codex-runtime"
import type { HarnessTurn } from "./harness-types"
import type { TranscriptEntry } from "../shared/types"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  } as TranscriptEntry
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("normalizeClaudeStreamMessage", () => {
  test("normalizes assistant tool calls", () => {
    const entries = normalizeClaudeStreamMessage({
      type: "assistant",
      uuid: "msg-1",
      message: {
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "Bash",
            input: {
              command: "pwd",
              timeout: 1000,
            },
          },
        ],
      },
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe("tool_call")
    if (entries[0]?.kind !== "tool_call") throw new Error("unexpected entry")
    expect(entries[0].tool.toolKind).toBe("bash")
  })

  test("normalizes result messages", () => {
    const entries = normalizeClaudeStreamMessage({
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 3210,
      result: "done",
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe("result")
    if (entries[0]?.kind !== "result") throw new Error("unexpected entry")
    expect(entries[0].durationMs).toBe(3210)
  })
})

describe("AgentCoordinator codex integration", () => {
  test("generates a chat title in the background on the first user message", async () => {
    const fakeCodexManager = {
      async startSession() {},
      async startTurn(): Promise<HarnessTurn> {
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
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
      generateTitle: async () => "Generated title",
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "first message",
      model: "gpt-5.4",
    })

    await waitFor(() => store.chat.title === "Generated title")
    expect(store.messages[0]?.kind).toBe("user_prompt")
  })

  test("passes project id through the codex runtime session boundary", async () => {
    const startedSessions: Array<{ chatId: string; projectId: string }> = []
    const runtime: CodexRuntime = {
      async startSession(args) {
        startedSessions.push({ chatId: args.chatId, projectId: args.projectId })
      },
      async startTurn(): Promise<HarnessTurn> {
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
      },
      stopSession() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "first message",
      model: "gpt-5.4",
    })

    expect(startedSessions).toEqual([{ chatId: "chat-1", projectId: "project-1" }])
  })

  test("injects delegated context into the provider turn without rewriting the visible user prompt", async () => {
    let runtimeTurnContent = ""
    const runtime: CodexRuntime = {
      async startSession() {},
      async startTurn(args): Promise<HarnessTurn> {
        runtimeTurnContent = args.content

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
      },
      stopSession() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
    })

    await coordinator.startTurnForChat({
      chatId: "chat-1",
      provider: "codex",
      content: "Write the patch",
      delegatedContext: "Forked parent chat context:\nUser: Repro and logs\nAssistant: Root cause analysis",
      model: "gpt-5.4",
      planMode: false,
      appendUserPrompt: true,
    })

    await waitFor(() => store.messages.some((entry) => entry.kind === "result"))
    expect(store.messages[0]).toMatchObject({ kind: "user_prompt", content: "Write the patch" })
    expect(runtimeTurnContent).toContain("Forked parent chat context:")
    expect(runtimeTurnContent).toContain("Delegated task:\nWrite the patch")
  })

  test("isSpawned injects delegation preamble into provider turn content", async () => {
    let runtimeTurnContent = ""
    const runtime: CodexRuntime = {
      async startSession() {},
      async startTurn(args): Promise<HarnessTurn> {
        runtimeTurnContent = args.content

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
      },
      stopSession() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
    })

    await coordinator.startTurnForChat({
      chatId: "chat-1",
      provider: "codex",
      content: "Fix the auth bug",
      isSpawned: true,
      model: "gpt-5.4",
      planMode: false,
      appendUserPrompt: true,
    })

    await waitFor(() => store.messages.some((entry) => entry.kind === "result"))
    // The user-visible prompt stays clean
    expect(store.messages[0]).toMatchObject({ kind: "user_prompt", content: "Fix the auth bug" })
    // But the provider turn content includes delegation preamble with session identity
    expect(runtimeTurnContent).toMatch(/spawned.*parent/i)
    expect(runtimeTurnContent).toMatch(/report/i)
    expect(runtimeTurnContent).toContain("chat-1")
    expect(runtimeTurnContent).toContain("Fix the auth bug")
  })

  test("isSpawned preamble combines with delegatedContext when both are present", async () => {
    let runtimeTurnContent = ""
    const runtime: CodexRuntime = {
      async startSession() {},
      async startTurn(args): Promise<HarnessTurn> {
        runtimeTurnContent = args.content

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
      },
      stopSession() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
    })

    await coordinator.startTurnForChat({
      chatId: "chat-1",
      provider: "codex",
      content: "Write the patch",
      delegatedContext: "Forked parent chat context:\nUser: Auth logs\nAssistant: Root cause found",
      isSpawned: true,
      model: "gpt-5.4",
      planMode: false,
      appendUserPrompt: true,
    })

    await waitFor(() => store.messages.some((entry) => entry.kind === "result"))
    // Both preamble and context should be present
    expect(runtimeTurnContent).toMatch(/spawned.*parent/i)
    expect(runtimeTurnContent).toContain("Forked parent chat context:")
    expect(runtimeTurnContent).toContain("Write the patch")
  })

  test("does not overwrite a manual rename when background title generation finishes later", async () => {
    let releaseTitle!: () => void
    const titleGate = new Promise<void>((resolve) => {
      releaseTitle = resolve
    })
    const fakeCodexManager = {
      async startSession() {},
      async startTurn(): Promise<HarnessTurn> {
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
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
      generateTitle: async () => {
        await titleGate
        return "Generated title"
      },
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "first message",
      model: "gpt-5.4",
    })

    await store.renameChat("chat-1", "Manual title")
    releaseTitle()
    await waitFor(() => store.turnFinishedCount === 1)

    expect(store.chat.title).toBe("Manual title")
  })

  test("binds codex provider and reuses the session token on later turns", async () => {
    const sessionCalls: Array<{ chatId: string; sessionToken: string | null }> = []
    const fakeCodexManager = {
      async startSession(args: { chatId: string; sessionToken: string | null }) {
        sessionCalls.push({ chatId: args.chatId, sessionToken: args.sessionToken })
      },
      async startTurn(): Promise<HarnessTurn> {
        async function* stream() {
          yield { type: "session_token" as const, sessionToken: "thread-1" }
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
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "first",
    })

    await waitFor(() => store.turnFinishedCount === 1)
    expect(store.chat.provider).toBe("codex")
    expect(store.chat.sessionToken).toBe("thread-1")
    expect(sessionCalls).toEqual([{ chatId: "chat-1", sessionToken: null }])

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      content: "second",
    })

    await waitFor(() => store.turnFinishedCount === 2)
    expect(sessionCalls).toEqual([
      { chatId: "chat-1", sessionToken: null },
      { chatId: "chat-1", sessionToken: "thread-1" },
    ])
  })

  test("clears a stale session token when binding a legacy chat to codex", async () => {
    const sessionCalls: Array<{ chatId: string; sessionToken: string | null }> = []
    const fakeCodexManager = {
      async startSession(args: { chatId: string; sessionToken: string | null }) {
        sessionCalls.push({ chatId: args.chatId, sessionToken: args.sessionToken })
      },
      async startTurn(): Promise<HarnessTurn> {
        async function* stream() {
          yield { type: "session_token" as const, sessionToken: "thread-1" }
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
      },
    }

    const store = createFakeStore()
    store.chat.sessionToken = "legacy-claude-session"

    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "first",
    })

    await waitFor(() => store.turnFinishedCount === 1)
    expect(store.chat.provider).toBe("codex")
    expect(store.chat.sessionToken).toBe("thread-1")
    expect(sessionCalls).toEqual([{ chatId: "chat-1", sessionToken: null }])
  })

  test("maps codex model options into session and turn settings", async () => {
    const sessionCalls: Array<{ chatId: string; sessionToken: string | null; serviceTier?: string }> = []
    const turnCalls: Array<{ effort?: string; serviceTier?: string }> = []

    const fakeCodexManager = {
      async startSession(args: { chatId: string; sessionToken: string | null; serviceTier?: string }) {
        sessionCalls.push({
          chatId: args.chatId,
          sessionToken: args.sessionToken,
          serviceTier: args.serviceTier,
        })
      },
      async startTurn(args: { effort?: string; serviceTier?: string }): Promise<HarnessTurn> {
        turnCalls.push({
          effort: args.effort,
          serviceTier: args.serviceTier,
        })

        async function* stream() {
          yield { type: "session_token" as const, sessionToken: "thread-1" }
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
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "opt in",
      modelOptions: {
        codex: {
          reasoningEffort: "xhigh",
          fastMode: true,
        },
      },
    })

    await waitFor(() => store.turnFinishedCount === 1)

    expect(sessionCalls).toEqual([{ chatId: "chat-1", sessionToken: null, serviceTier: "fast" }])
    expect(turnCalls).toEqual([{ effort: "xhigh", serviceTier: "fast" }])
  })

  test("disposeChat stops an idle codex session after the turn has already finished", async () => {
    const stoppedChatIds: string[] = []
    const fakeCodexManager = {
      async startSession() {},
      async startTurn(): Promise<HarnessTurn> {
        async function* stream() {
          yield { type: "session_token" as const, sessionToken: "thread-1" }
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
      },
      stopSession(chatId: string) {
        stoppedChatIds.push(chatId)
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "first",
    })

    await waitFor(() => store.turnFinishedCount === 1)
    await coordinator.disposeChat("chat-1")

    expect(stoppedChatIds).toEqual(["chat-1"])
  })

  test("approving synthetic codex ExitPlanMode starts a hidden follow-up turn and can clear context", async () => {
    const sessionCalls: Array<{ chatId: string; sessionToken: string | null }> = []
    const startTurnCalls: Array<{ content: string; planMode: boolean }> = []
    let turnCount = 0

    const fakeCodexManager = {
      async startSession(args: { chatId: string; sessionToken: string | null }) {
        sessionCalls.push({ chatId: args.chatId, sessionToken: args.sessionToken })
      },
      async startTurn(args: {
        content: string
        planMode: boolean
        onToolRequest: (request: any) => Promise<unknown>
      }): Promise<HarnessTurn> {
        startTurnCalls.push({ content: args.content, planMode: args.planMode })
        turnCount += 1

        async function* firstStream() {
          yield { type: "session_token" as const, sessionToken: "thread-1" }
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
              kind: "tool_call",
              tool: {
                kind: "tool",
                toolKind: "exit_plan_mode",
                toolName: "ExitPlanMode",
                toolId: "exit-1",
                input: {
                  plan: "## Plan\n\n- [ ] Ship it",
                  summary: "Plan summary",
                },
              },
            }),
          }
          await args.onToolRequest({
            tool: {
              kind: "tool",
              toolKind: "exit_plan_mode",
              toolName: "ExitPlanMode",
              toolId: "exit-1",
              input: {
                plan: "## Plan\n\n- [ ] Ship it",
                summary: "Plan summary",
              },
            },
          })
        }

        async function* secondStream() {
          yield { type: "session_token" as const, sessionToken: "thread-2" }
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
          stream: turnCount === 1 ? firstStream() : secondStream(),
          interrupt: async () => {},
          close: () => {},
        }
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "plan this",
      planMode: true,
    })

    await waitFor(() => coordinator.getPendingTool("chat-1")?.toolKind === "exit_plan_mode")

    await coordinator.respondTool({
      type: "chat.respondTool",
      chatId: "chat-1",
      toolUseId: "exit-1",
      result: {
        confirmed: true,
        clearContext: true,
        message: "Use the fast path",
      },
    })

    await waitFor(() => store.turnFinishedCount === 1)

    expect(startTurnCalls).toEqual([
      { content: "plan this", planMode: true },
      { content: "Proceed with the approved plan. Additional guidance: Use the fast path", planMode: false },
    ])
    expect(sessionCalls).toEqual([
      { chatId: "chat-1", sessionToken: null },
      { chatId: "chat-1", sessionToken: null },
    ])
    expect(store.messages.filter((entry) => entry.kind === "user_prompt")).toHaveLength(1)
    expect(store.messages.some((entry) => entry.kind === "context_cleared")).toBe(true)
    expect(store.chat.sessionToken).toBe("thread-2")
  })

  test("cancelling a waiting ask-user-question records a discarded tool result", async () => {
    let releaseInterrupt!: () => void
    const interrupted = new Promise<void>((resolve) => {
      releaseInterrupt = resolve
    })

    const fakeCodexManager = {
      async startSession() {},
      async startTurn(args: {
        onToolRequest: (request: any) => Promise<unknown>
      }): Promise<HarnessTurn> {
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
          void args.onToolRequest({
            tool: {
              kind: "tool",
              toolKind: "ask_user_question",
              toolName: "AskUserQuestion",
              toolId: "question-1",
              input: {
                questions: [{ question: "Provider?" }],
              },
            },
          })
          await interrupted
        }

        return {
          provider: "codex",
          stream: stream(),
          interrupt: async () => {
            releaseInterrupt()
          },
          close: () => {},
        }
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "ask me something",
    })

    await waitFor(() => coordinator.getPendingTool("chat-1")?.toolKind === "ask_user_question")
    await coordinator.cancel("chat-1")

    const discardedResult = store.messages.find((entry) => entry.kind === "tool_result" && entry.toolId === "question-1")
    expect(discardedResult).toBeDefined()
    if (!discardedResult || discardedResult.kind !== "tool_result") {
      throw new Error("missing discarded ask-user-question result")
    }
    expect(discardedResult.content).toEqual({ discarded: true, answers: {} })
    expect(store.messages.some((entry) => entry.kind === "interrupted")).toBe(true)
  })

  test("cancelling a waiting codex exit-plan prompt discards it without starting a follow-up turn", async () => {
    let releaseInterrupt!: () => void
    const interrupted = new Promise<void>((resolve) => {
      releaseInterrupt = resolve
    })
    const startTurnCalls: string[] = []

    const fakeCodexManager = {
      async startSession() {},
      async startTurn(args: {
        content: string
        onToolRequest: (request: any) => Promise<unknown>
      }): Promise<HarnessTurn> {
        startTurnCalls.push(args.content)

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
              kind: "tool_call",
              tool: {
                kind: "tool",
                toolKind: "exit_plan_mode",
                toolName: "ExitPlanMode",
                toolId: "exit-1",
                input: {
                  plan: "## Plan",
                },
              },
            }),
          }
          await args.onToolRequest({
            tool: {
              kind: "tool",
              toolKind: "exit_plan_mode",
              toolName: "ExitPlanMode",
              toolId: "exit-1",
              input: {
                plan: "## Plan",
              },
            },
          })
          await interrupted
        }

        return {
          provider: "codex",
          stream: stream(),
          interrupt: async () => {
            releaseInterrupt()
          },
          close: () => {},
        }
      },
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "plan this",
      planMode: true,
    })

    await waitFor(() => coordinator.getPendingTool("chat-1")?.toolKind === "exit_plan_mode")
    await coordinator.cancel("chat-1")

    const discardedResult = store.messages.find((entry) => entry.kind === "tool_result" && entry.toolId === "exit-1")
    expect(discardedResult).toBeDefined()
    if (!discardedResult || discardedResult.kind !== "tool_result") {
      throw new Error("missing discarded exit-plan result")
    }
    expect(discardedResult.content).toEqual({ discarded: true })
    expect(startTurnCalls).toEqual(["plan this"])
  })

  test("getContextUsage is called and a context_usage transcript entry is appended", async () => {
    const contextUsageData = { percentage: 42, totalTokens: 55000, maxTokens: 128000 }

    const runtime: CodexRuntime = {
      async startSession() {},
      async startTurn(): Promise<HarnessTurn> {
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
          getContextUsage: async () => contextUsageData,
          interrupt: async () => {},
          close: () => {},
        }
      },
      stopSession() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "hello",
      model: "gpt-5.4",
    })

    await waitFor(() => store.messages.some((e) => e.kind === "context_usage"))
    const contextEntry = store.messages.find((e) => e.kind === "context_usage")
    expect(contextEntry).toBeDefined()
    if (contextEntry?.kind !== "context_usage") throw new Error("unexpected kind")
    expect(contextEntry.contextUsage).toEqual(contextUsageData)
  })

  test("result entries from the stream are suppressed after cancel", async () => {
    let releaseInterrupt!: () => void
    const interrupted = new Promise<void>((resolve) => {
      releaseInterrupt = resolve
    })

    const fakeCodexManager = {
      async startSession() {},
      async startTurn(): Promise<HarnessTurn> {
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
          await interrupted
          // After cancel, the CLI sends back an error result — should be suppressed
          yield {
            type: "transcript" as const,
            entry: timestamped({
              kind: "result",
              subtype: "error",
              isError: true,
              durationMs: 0,
              result: "",
            }),
          }
        }

        return {
          provider: "codex",
          stream: stream(),
          interrupt: async () => {
            releaseInterrupt()
          },
          close: () => {},
        }
      },
    }

    const store = createFakeStore()
    // Allow turn failures in this test (default fake store throws)
    store.recordTurnFailed = (async () => {}) as never
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "do something",
    })

    await waitFor(() => store.messages.some((e) => e.kind === "system_init"))
    await coordinator.cancel("chat-1")

    // Give the stream time to process the post-cancel result entry
    await new Promise((r) => setTimeout(r, 100))

    // cancel() appends exactly one "interrupted" entry
    const interruptedEntries = store.messages.filter((e) => e.kind === "interrupted")
    expect(interruptedEntries).toHaveLength(1)

    // The error result from the stream should NOT appear in the transcript
    const resultEntries = store.messages.filter((e) => e.kind === "result")
    expect(resultEntries).toHaveLength(0)
  })
})

describe("AgentCoordinator skill discovery", () => {
  test("records turn error when codex startSession throws", async () => {
    const fakeCodexManager = {
      async startSession(): Promise<void> {
        throw new Error("thread/resume failed: thread is not rollable")
      },
      async startTurn(): Promise<HarnessTurn> {
        throw new Error("should not be called")
      },
      stopSession() {},
    }

    const store = createFakeStore()
    const failedMessages: string[] = []
    store.recordTurnFailed = async (_chatId: string, message: string) => {
      failedMessages.push(message)
    }

    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexManager: fakeCodexManager as never,
    })

    await coordinator.send({
      type: "chat.send",
      chatId: "chat-1",
      provider: "codex",
      content: "hello",
      model: "gpt-5.4",
    })

    await waitFor(() => failedMessages.length > 0)

    expect(failedMessages[0]).toContain("thread is not rollable")
    const errorResult = store.messages.find((e) => e.kind === "result" && e.isError)
    expect(errorResult).toBeDefined()
  })

  test("passes resolved skills to codex startTurn", async () => {
    const receivedSkills: Array<string[] | undefined> = []
    const runtime: CodexRuntime = {
      async startSession() {},
      async startTurn(args): Promise<HarnessTurn> {
        receivedSkills.push(args.skills)

        async function* stream() {
          yield {
            type: "transcript" as const,
            entry: timestamped({
              kind: "system_init",
              provider: "codex",
              model: "gpt-5.4",
              tools: [],
              agents: [],
              slashCommands: args.skills ?? [],
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
      },
      stopSession() {},
    }

    const fakeSkillCache = {
      async get(_projectPath: string) {
        return ["c3", "commit", "review-pr"]
      },
      invalidate() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
      skillCache: fakeSkillCache as never,
    })

    await coordinator.startTurnForChat({
      chatId: "chat-1",
      provider: "codex",
      content: "hello",
      model: "gpt-5.4",
      planMode: false,
      appendUserPrompt: true,
    })

    await waitFor(() => store.messages.some((e) => e.kind === "result"))
    expect(receivedSkills).toHaveLength(1)
    expect(receivedSkills[0]).toEqual(["c3", "commit", "review-pr"])
  })

  test("codex system_init includes discovered skills in slashCommands", async () => {
    const runtime: CodexRuntime = {
      async startSession() {},
      async startTurn(args): Promise<HarnessTurn> {
        async function* stream() {
          yield {
            type: "transcript" as const,
            entry: timestamped({
              kind: "system_init",
              provider: "codex",
              model: "gpt-5.4",
              tools: [],
              agents: [],
              slashCommands: args.skills ?? [],
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
      },
      stopSession() {},
    }

    const fakeSkillCache = {
      async get() {
        return ["frontend-design"]
      },
      invalidate() {},
    }

    const store = createFakeStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      codexRuntime: runtime,
      skillCache: fakeSkillCache as never,
    })

    await coordinator.startTurnForChat({
      chatId: "chat-1",
      provider: "codex",
      content: "build the UI",
      model: "gpt-5.4",
      planMode: false,
      appendUserPrompt: true,
    })

    await waitFor(() => store.messages.some((e) => e.kind === "result"))
    const initEntry = store.messages.find((e) => e.kind === "system_init")
    expect(initEntry).toBeDefined()
    if (initEntry?.kind === "system_init") {
      expect(initEntry.slashCommands).toEqual(["frontend-design"])
    }
  })
})

function createFakeStore() {
  const chat = {
    id: "chat-1",
    projectId: "project-1",
    title: "New Chat",
    provider: null as "claude" | "codex" | null,
    planMode: false,
    sessionToken: null as string | null,
  }
  const project = {
    id: "project-1",
    localPath: "/tmp/project",
  }
  return {
    chat,
    turnFinishedCount: 0,
    messages: [] as TranscriptEntry[],
    requireChat(chatId: string) {
      expect(chatId).toBe("chat-1")
      return chat
    },
    getProject(projectId: string) {
      expect(projectId).toBe("project-1")
      return project
    },
    getMessages() {
      return this.messages
    },
    async setChatProvider(_chatId: string, provider: "claude" | "codex") {
      chat.provider = provider
    },
    async setPlanMode(_chatId: string, planMode: boolean) {
      chat.planMode = planMode
    },
    async renameChat(_chatId: string, title: string) {
      chat.title = title
    },
    async appendMessage(_chatId: string, entry: TranscriptEntry) {
      this.messages.push(entry)
    },
    async recordTurnStarted() {},
    async recordTurnFinished() {
      this.turnFinishedCount += 1
    },
    async recordTurnFailed(_chatId: string, _error: string): Promise<void> {
      throw new Error("Did not expect turn failure")
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
