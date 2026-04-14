import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { CodexAppServerManager } from "./codex-app-server"

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly messages: unknown[] = []
  killed = false

  constructor(
    private readonly onMessage?: (message: any, process: FakeCodexProcess) => void
  ) {
    super()
    let buffer = ""
    this.stdin.on("data", (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const message = JSON.parse(line)
        this.messages.push(message)
        this.onMessage?.(message, this)
      }
    })
  }

  kill() {
    this.killed = true
    this.emit("close", 0)
  }

  writeServerMessage(message: unknown) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  writeStderr(message: string) {
    this.stderr.write(`${message}\n`)
  }

  closeWithCode(code: number) {
    this.emit("close", code)
  }
}

async function collectStream(stream: AsyncIterable<any>) {
  const items: any[] = []
  for await (const item of stream) {
    items.push(item)
  }
  return items
}

describe("CodexAppServerManager", () => {
  function expectPresentContentSchemaValidationError(value: unknown) {
    expect(value).toEqual({
      error: {
        source: "schema_validation",
        schema: "present_content",
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: expect.any(Array),
            code: expect.any(String),
            message: expect.any(String),
          }),
        ]),
      },
    })
  }

  test("initializes app-server and starts a fresh thread", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    expect(process.messages).toHaveLength(3)
    expect((process.messages[0] as any).method).toBe("initialize")
    expect((process.messages[1] as any).method).toBe("initialized")
    expect((process.messages[2] as any).method).toBe("thread/start")
  })

  test("falls back to thread/start when thread/resume is recoverably missing", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/resume") {
        child.writeServerMessage({
          id: message.id,
          error: { message: "thread/resume failed: thread not found" },
        })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-2" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: "missing-thread",
    })

    expect(process.messages.map((message: any) => message.method)).toEqual([
      "initialize",
      "initialized",
      "thread/resume",
      "thread/start",
    ])
  })

  test("falls back to thread/start when thread/resume reports no rollout found", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/resume") {
        child.writeServerMessage({
          id: message.id,
          error: { message: "thread/resume failed: no rollout found for thread id stale-thread" },
        })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-3" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: "stale-thread",
    })

    expect(process.messages.map((message: any) => message.method)).toEqual([
      "initialize",
      "initialized",
      "thread/resume",
      "thread/start",
    ])
  })

  test("falls back to thread/start for any unrecognized thread/resume error", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/resume") {
        child.writeServerMessage({
          id: message.id,
          error: { message: "thread/resume failed: thread is not rollable" },
        })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-4" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: "not-rollable-thread",
    })

    expect(process.messages.map((message: any) => message.method)).toEqual([
      "initialize",
      "initialized",
      "thread/resume",
      "thread/start",
    ])
  })

  test("maps fast mode and reasoning into app-server params", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "completed", error: null } },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      serviceTier: "fast",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      effort: "xhigh",
      serviceTier: "fast",
      content: "Run pwd",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    await collectStream(turn.stream)

    const threadStart = process.messages.find((message: any) => message.method === "thread/start") as
      | { method: "thread/start"; params: { serviceTier?: string } }
      | undefined
    const turnStart = process.messages.find((message: any) => message.method === "turn/start") as
      | { method: "turn/start"; params: { effort?: string; serviceTier?: string; collaborationMode?: { settings?: { reasoning_effort?: string | null } } } }
      | undefined

    expect(threadStart?.params.serviceTier).toBe("fast")
    expect(turnStart?.params.effort).toBe("xhigh")
    expect(turnStart?.params.serviceTier).toBe("fast")
    expect(turnStart?.params.collaborationMode?.settings?.reasoning_effort).toBeNull()
  })

  test("advertises present_content as a dynamic tool on turn start", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        expect(message.params.dynamicTools).toBeDefined()
        expect(message.params.dynamicTools).toContainEqual(
          expect.objectContaining({
            name: "present_content",
            inputSchema: expect.objectContaining({
              type: "object",
              required: ["title", "kind", "format", "source"],
            }),
          })
        )
        expect(message.params.collaborationMode?.settings?.developer_instructions).toContain("its final turn result is what wait_agent returns")
        expect(message.params.collaborationMode?.settings?.developer_instructions).toContain(
          "Do not assume delegated chats share live intermediate reasoning"
        )
        expect(message.params.collaborationMode?.settings?.developer_instructions).toContain(
          "Use structured rich transcript output when it improves clarity"
        )
        expect(message.params.collaborationMode?.settings?.developer_instructions).toContain(
          "Prefer direct rich embeds or structured artifact cards over bare links"
        )
        expect(message.params.collaborationMode?.settings?.developer_instructions).toContain("implementation plans")
        expect(message.params.collaborationMode?.settings?.developer_instructions).toContain("comparison tables")
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "completed", error: null } },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "show a card",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    await collectStream(turn.stream)
  })

  test("advertises session orchestration tools on turn start when available", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        expect(message.params.dynamicTools).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "present_content" }),
            expect.objectContaining({ name: "spawn_agent" }),
            expect.objectContaining({ name: "list_agents" }),
            expect.objectContaining({ name: "send_input" }),
            expect.objectContaining({ name: "wait_agent" }),
            expect.objectContaining({ name: "close_agent" }),
          ]),
        )
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "completed", error: null } },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "delegate work",
      planMode: false,
      orchestrator: {
        async spawnAgent() { return { chatId: "child-1" } },
        listAgents() { return { children: [] } },
        async sendInput() {},
        async waitForResult() { return { result: "done", isError: false } },
        async closeAgent() {},
      },
      orchestrationChatId: "chat-1",
      onToolRequest: async () => ({}),
    })

    await collectStream(turn.stream)
  })

  test("generateStructured returns the final assistant JSON and stops the transient session", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-structured" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-structured", status: "completed", error: null } },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-structured",
            turnId: "turn-structured",
            item: {
              type: "agentMessage",
              id: "msg-structured",
              text: "{\"title\":\"Codex title\"}",
              phase: "final_answer",
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-structured",
            turn: { id: "turn-structured", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    const result = await manager.generateStructured({
      cwd: "/tmp/project",
      prompt: "Return JSON",
    })

    expect(result).toBe("{\"title\":\"Codex title\"}")
    expect(process.killed).toBe(true)
  })

  test("generateStructured does not advertise dynamic tools on turn start", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-structured" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        expect(message.params.dynamicTools).toBeUndefined()
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-structured", status: "completed", error: null } },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-structured",
            turnId: "turn-structured",
            item: {
              type: "agentMessage",
              id: "msg-structured",
              text: "{\"title\":\"Codex title\"}",
              phase: "final_answer",
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-structured",
            turn: { id: "turn-structured", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    const result = await manager.generateStructured({
      cwd: "/tmp/project",
      prompt: "Return JSON",
    })

    expect(result).toBe("{\"title\":\"Codex title\"}")
    expect(process.killed).toBe(true)
  })

  test("maps command execution and agent output into the shared transcript stream", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/started",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "commandExecution",
              id: "call-1",
              command: "/bin/zsh -lc pwd",
              status: "inProgress",
            },
          },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "commandExecution",
              id: "call-1",
              command: "/bin/zsh -lc pwd",
              status: "completed",
              aggregatedOutput: "/tmp/project\n",
              exitCode: 0,
            },
          },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "agentMessage",
              id: "msg-1",
              text: "/tmp/project",
              phase: "final_answer",
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "Run pwd",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const transcriptKinds = events
      .filter((event) => event.type === "transcript")
      .map((event) => event.entry.kind)

    expect(events[0]).toEqual({ type: "session_token", sessionToken: "thread-1" })
    expect(transcriptKinds).toEqual(["system_init", "tool_call", "tool_result", "assistant_text", "result"])
  })

  test("emits only a compact boundary when Codex reports thread compaction", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "thread/compacted",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "/compact",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const transcriptKinds = events
      .filter((event) => event.type === "transcript")
      .map((event) => event.entry.kind)

    expect(transcriptKinds).toEqual(["system_init", "compact_boundary", "result"])
    expect(transcriptKinds).not.toContain("context_cleared")
  })

  test("maps fileChange updates into edit_file tool calls", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/started",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "call-1",
              changes: [
                {
                  path: "/tmp/project/test.md",
                  kind: {
                    type: "update",
                    move_path: null,
                  },
                  diff: "@@ -1,2 +1,2 @@\n-old line\n+new line",
                },
              ],
              status: "inProgress",
            },
          },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "call-1",
              changes: [
                {
                  path: "/tmp/project/test.md",
                  kind: {
                    type: "update",
                    move_path: null,
                  },
                  diff: "@@ -1,2 +1,2 @@\n-old line\n+new line",
                },
              ],
              status: "completed",
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "edit a file",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("edit_file")
    expect(toolCall.entry.tool.toolName).toBe("Edit")
    expect(toolCall.entry.tool.input).toEqual({
      filePath: "/tmp/project/test.md",
      oldString: "old line",
      newString: "new line",
    })
  })

  test("maps fileChange adds into write_file tool calls", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/started",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "call-1",
              changes: [
                {
                  path: "/tmp/project/test.md",
                  kind: {
                    type: "add",
                    move_path: null,
                  },
                  diff: "@@ -0,0 +1,2 @@\n+hello\n+world",
                },
              ],
              status: "inProgress",
            },
          },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "call-1",
              changes: [
                {
                  path: "/tmp/project/test.md",
                  kind: {
                    type: "add",
                    move_path: null,
                  },
                  diff: "@@ -0,0 +1,2 @@\n+hello\n+world",
                },
              ],
              status: "completed",
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "write a file",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("write_file")
    expect(toolCall.entry.tool.toolName).toBe("Write")
    expect(toolCall.entry.tool.input).toEqual({
      filePath: "/tmp/project/test.md",
      content: "hello\nworld",
    })
  })

  test("splits multi-change fileChange items into multiple tool calls and results", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "fileChange",
              id: "call-1",
              changes: [
                {
                  path: "/tmp/project/one.md",
                  kind: {
                    type: "add",
                    move_path: null,
                  },
                  diff: "@@ -0,0 +1,2 @@\n+hello\n+world",
                },
                {
                  path: "/tmp/project/two.md",
                  kind: {
                    type: "update",
                    move_path: null,
                  },
                  diff: "@@ -1,2 +1,2 @@\n-old line\n+new line",
                },
              ],
              status: "completed",
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "change multiple files",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCalls = events.filter((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResults = events.filter((event) => event.type === "transcript" && event.entry.kind === "tool_result")

    expect(toolCalls).toHaveLength(2)
    expect(toolResults).toHaveLength(2)

    expect(toolCalls[0]?.entry.kind).toBe("tool_call")
    expect(toolCalls[1]?.entry.kind).toBe("tool_call")
    if (toolCalls[0]?.entry.kind !== "tool_call" || toolCalls[1]?.entry.kind !== "tool_call") {
      throw new Error("missing tool calls")
    }

    expect(toolCalls[0].entry.tool.toolKind).toBe("write_file")
    expect(toolCalls[0].entry.tool.toolId).toBe("call-1:change:0")
    expect(toolCalls[0].entry.tool.input).toEqual({
      filePath: "/tmp/project/one.md",
      content: "hello\nworld",
    })

    expect(toolCalls[1].entry.tool.toolKind).toBe("edit_file")
    expect(toolCalls[1].entry.tool.toolId).toBe("call-1:change:1")
    expect(toolCalls[1].entry.tool.input).toEqual({
      filePath: "/tmp/project/two.md",
      oldString: "old line",
      newString: "new line",
    })

    expect(toolResults[0]?.entry.kind).toBe("tool_result")
    expect(toolResults[1]?.entry.kind).toBe("tool_result")
    if (toolResults[0]?.entry.kind !== "tool_result" || toolResults[1]?.entry.kind !== "tool_result") {
      throw new Error("missing tool results")
    }

    expect(toolResults[0].entry.toolId).toBe("call-1:change:0")
    expect(toolResults[1].entry.toolId).toBe("call-1:change:1")
  })

  test("maps plan updates into TodoWrite and synthesizes ExitPlanMode on successful plan turns", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "turn/plan/updated",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            explanation: "Plan the work",
            plan: [
              { step: "Inspect repo", status: "completed" },
              { step: "Implement changes", status: "inProgress" },
            ],
          },
        })
        child.writeServerMessage({
          method: "item/started",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "plan",
              id: "plan-1",
              text: "",
            },
          },
        })
        child.writeServerMessage({
          method: "item/plan/delta",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "plan-1",
            delta: "## Plan\n\n- [x] Inspect repo\n- [ ] Implement changes",
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "make a plan",
      planMode: true,
      onToolRequest: async () => ({ confirmed: true }),
    })

    const events = await collectStream(turn.stream)
    const toolCalls = events
      .filter((event) => event.type === "transcript" && event.entry.kind === "tool_call")
      .map((event) => event.entry.tool)

    expect(toolCalls[0]?.toolKind).toBe("todo_write")
    expect(toolCalls[1]?.toolKind).toBe("exit_plan_mode")
    if (!toolCalls[1] || toolCalls[1].toolKind !== "exit_plan_mode") {
      throw new Error("missing ExitPlanMode tool")
    }
    expect(toolCalls[1].input.summary).toBe("Plan the work")
    expect(toolCalls[1].input.plan).toContain("## Plan")
  })

  test("maps collab agent tool calls into subagent_task", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "collabAgentToolCall",
              id: "agent-1",
              tool: "spawnAgent",
              status: "completed",
              senderThreadId: "thread-1",
              receiverThreadIds: ["thread-2"],
              prompt: "Inspect tests",
              agentsStates: {
                "thread-2": { status: "running", message: "Inspecting" },
              },
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "spawn an agent",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("subagent_task")
    expect(toolCall.entry.tool.input).toEqual({ subagentType: "spawnAgent" })
  })

  test("marks failed collab agent tool calls as transcript errors", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "collabAgentToolCall",
              id: "agent-failed-1",
              tool: "spawnAgent",
              status: "failed",
              senderThreadId: "thread-1",
              receiverThreadIds: [],
              prompt: "Inspect tests",
              agentsStates: {},
              error: { message: "spawn failed" },
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "spawn an agent",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("subagent_task")
    expect(toolResult?.entry.kind).toBe("tool_result")
    if (!toolResult || toolResult.entry.kind !== "tool_result") throw new Error("missing tool result")
    expect(toolResult.entry.isError).toBe(true)
  })

  test("uses the completed webSearch query when the started item is empty", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/started",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "webSearch",
              id: "ws-1",
              query: "",
            },
          },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "webSearch",
              id: "ws-1",
              query: "jake mor",
              action: {
                type: "search",
                query: "jake mor",
                queries: ["jake mor"],
              },
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "search",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCalls = events.filter((event) => event.type === "transcript" && event.entry.kind === "tool_call")

    expect(toolCalls).toHaveLength(1)
    const toolCall = toolCalls[0]
    if (toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("web_search")
    expect(toolCall.entry.tool.input).toEqual({ query: "jake mor" })
  })

  test("responds to unsupported dynamic tool requests with a generic tool error", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "dyn-1",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-1",
            tool: "custom_tool",
            arguments: { value: 1 },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "call tool",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")
    const response = process.messages.find((message: any) => message.id === "dyn-1")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("unknown_tool")
    expect(toolCall.entry.tool.toolName).toBe("custom_tool")
    expect(toolResult?.entry.kind).toBe("tool_result")
    expect(response).toEqual({
      id: "dyn-1",
      result: {
        contentItems: [{ type: "inputText", text: "Unsupported dynamic tool call: custom_tool" }],
        success: false,
      },
    })
  })

  test("records present_content dynamic tool calls as typed transcript entries", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
        return
      }
      if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
        return
      }
      if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "dyn-2",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-present-1",
            tool: "present_content",
            arguments: {
              title: "System Design",
              kind: "diagram",
              format: "mermaid",
              source: "graph TD\\nA-->B",
              summary: "Current state",
              collapsed: true,
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "show me the system",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")
    const response = process.messages.find((message: any) => message.id === "dyn-2")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("present_content")
    expect(toolResult?.entry.kind).toBe("tool_result")
    expect(toolResult?.entry.content).toEqual({
      accepted: true,
      title: "System Design",
      kind: "diagram",
      format: "mermaid",
      source: "graph TD\\nA-->B",
      summary: "Current state",
      collapsed: true,
    })
    expect(response).toEqual({
      id: "dyn-2",
      result: {
        contentItems: [{ type: "inputText", text: "presented" }],
        success: true,
      },
    })
  })

  test("routes session orchestration dynamic tools through the shared orchestrator", async () => {
    const spawnCalls: unknown[] = []
    const sendCalls: unknown[] = []
    const waitCalls: unknown[] = []
    const closeCalls: unknown[] = []
    const listCalls: string[] = []
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
        return
      }
      if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
        return
      }
      if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "dyn-spawn",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-spawn",
            tool: "spawn_agent",
            arguments: { instruction: "say hello", provider: "claude", fork_context: true },
          },
        })
        child.writeServerMessage({
          id: "dyn-list",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-list",
            tool: "list_agents",
            arguments: {},
          },
        })
        child.writeServerMessage({
          id: "dyn-send",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-send",
            tool: "send_input",
            arguments: { targetChatId: "child-1", content: "continue" },
          },
        })
        child.writeServerMessage({
          id: "dyn-wait",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-wait",
            tool: "wait_agent",
            arguments: { targetChatId: "child-1", timeoutMs: 25 },
          },
        })
        child.writeServerMessage({
          id: "dyn-close",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-close",
            tool: "close_agent",
            arguments: { targetChatId: "child-1" },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "delegate work",
      planMode: false,
      orchestrator: {
        async spawnAgent(callerChatId, args) {
          spawnCalls.push({ callerChatId, args })
          return { chatId: "child-1" }
        },
        listAgents(chatId) {
          listCalls.push(chatId)
          return { children: [{ chatId: "child-1", status: "running" }] }
        },
        async sendInput(callerChatId, args) {
          sendCalls.push({ callerChatId, args })
        },
        async waitForResult(callerChatId, args) {
          waitCalls.push({ callerChatId, args })
          return { result: "child done", isError: false }
        },
        async closeAgent(callerChatId, args) {
          closeCalls.push({ callerChatId, args })
        },
      },
      orchestrationChatId: "chat-1",
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCalls = events.filter((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResults = events.filter((event) => event.type === "transcript" && event.entry.kind === "tool_result")

    expect(toolCalls.map((event) => event.entry.tool.toolKind)).toEqual([
      "mcp_generic",
      "mcp_generic",
      "mcp_generic",
      "mcp_generic",
      "mcp_generic",
    ])
    expect(toolCalls.map((event) => event.entry.tool.toolName)).toEqual([
      "spawn_agent",
      "list_agents",
      "send_input",
      "wait_agent",
      "close_agent",
    ])
    expect(spawnCalls).toEqual([{ callerChatId: "chat-1", args: { instruction: "say hello", provider: "claude", forkContext: true, model: undefined } }])
    expect(listCalls).toEqual(["chat-1"])
    expect(sendCalls).toEqual([{ callerChatId: "chat-1", args: { targetChatId: "child-1", content: "continue", model: undefined } }])
    expect(waitCalls).toEqual([{ callerChatId: "chat-1", args: { targetChatId: "child-1", timeoutMs: 25 } }])
    expect(closeCalls).toEqual([{ callerChatId: "chat-1", args: { targetChatId: "child-1" } }])
    expect(toolResults.map((event) => event.entry.content)).toEqual([
      { chatId: "child-1" },
      { children: [{ chatId: "child-1", status: "running" }] },
      "Input sent",
      { result: "child done", isError: false },
      "Agent closed",
    ])
    expect(process.messages.filter((message: any) => typeof message.id === "string" && String(message.id).startsWith("dyn-"))).toEqual([
      { id: "dyn-spawn", result: { contentItems: [{ type: "inputText", text: "{\"chatId\":\"child-1\"}" }], success: true } },
      { id: "dyn-list", result: { contentItems: [{ type: "inputText", text: "{\"children\":[{\"chatId\":\"child-1\",\"status\":\"running\"}]}" }], success: true } },
      { id: "dyn-send", result: { contentItems: [{ type: "inputText", text: "Input sent" }], success: true } },
      { id: "dyn-wait", result: { contentItems: [{ type: "inputText", text: "{\"result\":\"child done\",\"isError\":false}" }], success: true } },
      { id: "dyn-close", result: { contentItems: [{ type: "inputText", text: "Agent closed" }], success: true } },
    ])
  })

  test("marks failed MCP tool calls as transcript errors", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
        return
      }
      if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
        return
      }
      if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          method: "item/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            item: {
              type: "mcpToolCall",
              id: "mcp-1",
              server: "sentry",
              tool: "search_issues",
              arguments: { query: "regression" },
              status: "failed",
              content: [{ type: "input_text", text: "MCP server unavailable" }],
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "call mcp",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("mcp_generic")
    expect(toolResult?.entry.kind).toBe("tool_result")
    if (!toolResult || toolResult.entry.kind !== "tool_result") throw new Error("missing tool result")
    expect(toolResult.entry.isError).toBe(true)
  })

  test("rejects present_content payloads with wrong optional types without crashing the turn", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
        return
      }
      if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
        return
      }
      if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "dyn-3",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-present-invalid-1",
            tool: "present_content",
            arguments: {
              title: "System Design",
              kind: "diagram",
              format: "mermaid",
              source: "graph TD\\nA-->B",
              summary: 42,
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "show invalid card",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")
    const response = process.messages.find((message: any) => message.id === "dyn-3")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("present_content")
    expect(toolResult?.entry.kind).toBe("tool_result")
    if (!toolResult || toolResult.entry.kind !== "tool_result") throw new Error("missing tool result")
    expect(toolResult.entry.isError).toBe(true)
    expectPresentContentSchemaValidationError(toolResult.entry.content)
    expect(response).toEqual({
      id: "dyn-3",
      result: {
        contentItems: [{ type: "inputText", text: "Invalid present_content payload" }],
        success: false,
      },
    })
  })

  test("rejects present_content payloads with extra keys under strict parsing", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
        return
      }
      if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
        return
      }
      if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "dyn-4",
          method: "item/tool/call",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            callId: "call-present-invalid-2",
            tool: "present_content",
            arguments: {
              title: "System Design",
              kind: "diagram",
              format: "mermaid",
              source: "graph TD\\nA-->B",
              extra: true,
            },
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "show invalid card",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")
    const response = process.messages.find((message: any) => message.id === "dyn-4")

    expect(toolCall?.entry.kind).toBe("tool_call")
    if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
    expect(toolCall.entry.tool.toolKind).toBe("present_content")
    expect(toolResult?.entry.kind).toBe("tool_result")
    if (!toolResult || toolResult.entry.kind !== "tool_result") throw new Error("missing tool result")
    expect(toolResult.entry.isError).toBe(true)
    expectPresentContentSchemaValidationError(toolResult.entry.content)
    expect(response).toEqual({
      id: "dyn-4",
      result: {
        contentItems: [{ type: "inputText", text: "Invalid present_content payload" }],
        success: false,
      },
    })
  })

  test("answers requestUserInput requests with the official JSON-RPC result payload", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "req-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "ask-1",
            questions: [
              {
                id: "runtime",
                header: "Runtime",
                question: "Which runtime?",
                isOther: false,
                isSecret: false,
                options: null,
              },
            ],
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "ask me",
      planMode: false,
      onToolRequest: async () => ({
        questions: [{
          id: "runtime",
          question: "Which runtime?",
        }],
        answers: {
          runtime: "bun",
        },
      }),
    })

    const events = await collectStream(turn.stream)
    const askEntry = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
    expect(askEntry?.entry.tool.toolKind).toBe("ask_user_question")

    const response = process.messages.find((message: any) => message.id === "req-1")
    expect(response).toEqual({
      id: "req-1",
      result: {
        answers: {
          runtime: {
            answers: ["bun"],
          },
        },
      },
    })
  })

  test("falls back to question text when requestUserInput answers are keyed by prompt text", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "req-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "ask-1",
            questions: [
              {
                id: "favorite_color",
                header: "Color",
                question: "What is your favorite color right now?",
                isOther: true,
                isSecret: false,
                options: [
                  { label: "Red", description: null },
                  { label: "Blue", description: null },
                ],
              },
            ],
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "ask me",
      planMode: false,
      onToolRequest: async () => ({
        questions: [{
          id: "favorite_color",
          question: "What is your favorite color right now?",
        }],
        answers: {
          "What is your favorite color right now?": "Red",
        },
      }),
    })

    await collectStream(turn.stream)

    const response = process.messages.find((message: any) => message.id === "req-1")
    expect(response).toEqual({
      id: "req-1",
      result: {
        answers: {
          favorite_color: {
            answers: ["Red"],
          },
        },
      },
    })
  })

  test("infers multi-select Codex questions from prompt text and returns multiple answers", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "req-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "ask-1",
            questions: [
              {
                id: "runtimes",
                header: "Runtime",
                question: "Select all runtimes that apply",
                isOther: true,
                isSecret: false,
                options: [
                  { label: "bun", description: null },
                  { label: "node", description: null },
                ],
              },
            ],
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "ask me",
      planMode: false,
      onToolRequest: async ({ tool }) => {
        expect(tool.toolKind).toBe("ask_user_question")
        if (tool.toolKind !== "ask_user_question") {
          return {}
        }

        expect(tool.input.questions[0]?.multiSelect).toBe(true)

        return {
          questions: [{
            id: "runtimes",
            question: "Select all runtimes that apply",
            multiSelect: true,
          }],
          answers: {
            runtimes: ["bun", "node"],
          },
        }
      },
    })

    await collectStream(turn.stream)

    const response = process.messages.find((message: any) => message.id === "req-1")
    expect(response).toEqual({
      id: "req-1",
      result: {
        answers: {
          runtimes: {
            answers: ["bun", "node"],
          },
        },
      },
    })
  })

  test("sends approval decisions back to the app-server", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeServerMessage({
          id: "approval-1",
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "call-1",
            command: "rm -rf .",
            cwd: "/tmp/project",
          },
        })
        child.writeServerMessage({
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: "completed", error: null },
          },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "approve something",
      planMode: false,
      onToolRequest: async () => ({}),
      onApprovalRequest: async () => "accept",
    })

    await collectStream(turn.stream)

    const response = process.messages.find((message: any) => message.id === "approval-1")
    expect(response).toEqual({
      id: "approval-1",
      result: {
        decision: "accept",
      },
    })
  })

  test("interrupt sends turn/interrupt for the active turn", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
      } else if (message.method === "turn/interrupt") {
        child.writeServerMessage({ id: message.id, result: {} })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "wait",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    await turn.interrupt()

    const interruptRequest = process.messages.find((message: any) => message.method === "turn/interrupt") as
      | { id: string; method: "turn/interrupt"; params: { threadId: string; turnId: string } }
      | undefined
    expect(interruptRequest).toBeDefined()
    if (!interruptRequest) throw new Error("missing interrupt request")
    expect(interruptRequest).toEqual({
      id: interruptRequest.id,
      method: "turn/interrupt",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
      },
    })
  })

  test("interrupt clears a pending exit-plan wait so a new turn can start immediately", async () => {
    let resolveToolRequest!: (value: unknown) => void

    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        if (message.params.input[0]?.text === "make a plan") {
          child.writeServerMessage({
            id: message.id,
            result: { turn: { id: "turn-plan", status: "completed", error: null } },
          })
          child.writeServerMessage({
            method: "turn/plan/updated",
            params: {
              threadId: "thread-1",
              turnId: "turn-plan",
              explanation: "Plan the work",
              plan: [{ step: "Inspect repo", status: "completed" }],
            },
          })
          child.writeServerMessage({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: { id: "turn-plan", status: "completed", error: null },
            },
          })
        } else {
          child.writeServerMessage({
            id: message.id,
            result: { turn: { id: "turn-next", status: "completed", error: null } },
          })
          child.writeServerMessage({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: { id: "turn-next", status: "completed", error: null },
            },
          })
        }
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "make a plan",
      planMode: true,
      onToolRequest: async () => await new Promise((resolve) => {
        resolveToolRequest = resolve
      }),
    })

    const iterator = turn.stream[Symbol.asyncIterator]()
    await iterator.next()
    await iterator.next()
    await iterator.next()
    await turn.interrupt()

    const nextTurn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "continue",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    await collectStream(nextTurn.stream)
    resolveToolRequest({})
  })

  test("emits an error result when the app-server exits mid-turn", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        child.writeStderr("fatal: app-server crashed")
        child.closeWithCode(1)
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "crash",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = await collectStream(turn.stream)
    const resultEvent = events.find((event) => event.type === "transcript" && event.entry.kind === "result")
    expect(resultEvent?.entry.subtype).toBe("error")
    expect(resultEvent?.entry.result).toContain("fatal: app-server crashed")
  })

  test("stopSession marks context closed, silencing subsequent writes", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    // Stop session — marks context as closed
    manager.stopSession("chat-1")

    // Starting a new turn on a stopped session should throw cleanly, not EPIPE
    expect(() => manager.stopSession("chat-1")).not.toThrow()
  })

  test("child crash during handleServerRequest does not produce unhandled rejection", async () => {
    const process = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      } else if (message.method === "thread/start") {
        child.writeServerMessage({
          id: message.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
        })
      } else if (message.method === "turn/start") {
        child.writeServerMessage({
          id: message.id,
          result: { turn: { id: "turn-1", status: "inProgress", error: null } },
        })
        // Send a server request, then immediately crash the child
        child.writeServerMessage({
          method: "item/tool/requestUserInput",
          id: "req-1",
          params: {
            itemId: "tool-crash",
            questions: [{ type: "text", text: "Pick:", options: ["x"] }],
          },
        })
        // Simulate child crash while request is in flight
        queueMicrotask(() => {
          child.closeWithCode(1)
        })
      }
    })

    const manager = new CodexAppServerManager({
      spawnProcess: () => process as never,
    })

    await manager.startSession({
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await manager.startTurn({
      chatId: "chat-1",
      model: "gpt-5.4",
      content: "crash during request",
      planMode: false,
      onToolRequest: async () => {
        // Simulate slow tool response — child will crash before this resolves
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { answer: "x" }
      },
    })

    // Should produce an error event, not an unhandled rejection
    const events = await collectStream(turn.stream)
    const resultEvent = events.find((event) => event.type === "transcript" && event.entry.kind === "result")
    expect(resultEvent?.entry.isError).toBe(true)
  })
})
