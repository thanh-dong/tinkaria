import { afterEach, describe, expect, test } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import type { TranscriptEntry } from "../shared/types"
import type { HarnessTurn } from "./harness-types"
import { LocalCodexKitDaemon, ProjectKitRegistry, RemoteCodexRuntime } from "./local-codex-kit"
import { ensureKitTurnEventsStream } from "./nats-streams"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  } as TranscriptEntry
}

let server: NatsServer | null = null
let hubNc: NatsConnection | null = null
let registry: ProjectKitRegistry | null = null
let daemon: LocalCodexKitDaemon | null = null

afterEach(async () => {
  registry?.dispose()
  registry = null
  if (daemon) {
    await daemon.dispose()
    daemon = null
  }
  if (hubNc) {
    await hubNc.drain()
    hubNc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
})

async function setup() {
  server = await NatsServer.start({ jetstream: true })
  hubNc = await connect({ servers: server.url })
  await ensureKitTurnEventsStream(hubNc)
  registry = new ProjectKitRegistry(hubNc)
  return { hubNc, registry }
}

describe("local codex kit", () => {
  test("supports a shared hub connection without opening a second client connection", async () => {
    const ctx = await setup()
    const sessionStarts: Array<{ chatId: string; cwd: string; model: string; sessionToken: string | null }> = []

    daemon = await LocalCodexKitDaemon.start({
      nc: ctx.hubNc,
      natsUrl: server!.url,
      kitId: "kit-a",
      codexManager: {
        async startSession(args: { chatId: string; cwd: string; model: string; sessionToken: string | null }) {
          sessionStarts.push(args)
        },
        async startTurn(): Promise<HarnessTurn> {
          async function* stream() {
            yield {
              type: "transcript" as const,
              entry: timestamped({
                kind: "result",
                subtype: "success",
                isError: false,
                durationMs: 0,
                result: "shared",
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
        stopAll() {},
      } as never,
    })

    const runtime = new RemoteCodexRuntime({
      nc: ctx.hubNc,
      registry: ctx.registry,
    })

    await runtime.startSession({
      chatId: "chat-shared",
      projectId: "project-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await runtime.startTurn({
      chatId: "chat-shared",
      content: "hello",
      model: "gpt-5.4",
      planMode: false,
      onToolRequest: async () => ({}),
    })

    const events = []
    for await (const event of turn.stream) {
      events.push(event)
    }

    expect(sessionStarts).toEqual([{
      chatId: "chat-shared",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    }])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: "transcript" })
  })

  test("binds a project to the first connected kit and reuses that assignment", async () => {
    const ctx = await setup()

    daemon = await LocalCodexKitDaemon.start({
      natsUrl: server!.url,
      kitId: "kit-a",
      codexManager: {
        async startSession() {},
        async startTurn(): Promise<HarnessTurn> {
          async function* stream() {
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
        stopAll() {},
      } as never,
    })

    const first = await ctx.registry.assignProject("project-1")
    const second = await ctx.registry.assignProject("project-1")

    expect(first.kitId).toBe("kit-a")
    expect(second.kitId).toBe("kit-a")
    expect(ctx.registry.getAssignedKit("project-1")?.kitId).toBe("kit-a")
  })

  test("streams kit turn events and relays tool responses back to the daemon", async () => {
    const ctx = await setup()
    const sessionStarts: Array<{ chatId: string; cwd: string; model: string; sessionToken: string | null }> = []
    const toolResponses: unknown[] = []

    daemon = await LocalCodexKitDaemon.start({
      natsUrl: server!.url,
      kitId: "kit-a",
      codexManager: {
        async startSession(args: { chatId: string; cwd: string; model: string; sessionToken: string | null }) {
          sessionStarts.push(args)
        },
        async startTurn(args: {
          onToolRequest: (request: unknown) => Promise<unknown>
        }): Promise<HarnessTurn> {
          async function* stream() {
            yield {
              type: "session_token" as const,
              sessionToken: "thread-1",
            }
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
            const result = await args.onToolRequest({
              tool: {
                kind: "tool",
                toolKind: "ask_user_question",
                toolName: "AskUserQuestion",
                toolId: "tool-1",
                input: {},
                rawInput: {},
              },
            })
            toolResponses.push(result)
            yield {
              type: "transcript" as const,
              entry: timestamped({
                kind: "result",
                subtype: "success",
                isError: false,
                durationMs: 0,
                result: "done",
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
        stopAll() {},
      } as never,
    })

    const runtime = new RemoteCodexRuntime({
      nc: ctx.hubNc,
      registry: ctx.registry,
    })

    await runtime.startSession({
      chatId: "chat-1",
      projectId: "project-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    })

    const turn = await runtime.startTurn({
      chatId: "chat-1",
      content: "hello",
      model: "gpt-5.4",
      planMode: false,
      onToolRequest: async () => ({ answers: { runtime: ["codex"] } }),
    })

    const events = []
    for await (const event of turn.stream) {
      events.push(event)
    }

    expect(sessionStarts).toEqual([{
      chatId: "chat-1",
      cwd: "/tmp/project",
      model: "gpt-5.4",
      sessionToken: null,
    }])
    expect(ctx.registry.getAssignedKit("project-1")?.kitId).toBe("kit-a")
    expect(toolResponses).toEqual([{ answers: { runtime: ["codex"] } }])
    expect(events.map((event) => event.type)).toEqual(["session_token", "transcript", "transcript"])
    expect(events[0]).toEqual({ type: "session_token", sessionToken: "thread-1" })
  })
})
