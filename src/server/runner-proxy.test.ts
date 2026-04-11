import { afterEach, describe, test, expect } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { RunnerProxy, type RunnerProxyOptions } from "./runner-proxy"
import type { SessionStatus } from "../shared/types"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const RUNNER_ID = "test-runner-1"

function createMockRunner(nc: NatsConnection, runnerId: string) {
  const received: unknown[] = []
  const sub = nc.subscribe(`runtime.runner.cmd.${runnerId}.>`)
  void (async () => {
    for await (const msg of sub) {
      received.push({
        subject: msg.subject,
        data: JSON.parse(decoder.decode(msg.data)),
      })
      msg.respond(encoder.encode(JSON.stringify({ ok: true })))
    }
  })()
  return { received, dispose: () => sub.unsubscribe() }
}

function createMockStore() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const store = {
    requireChat: (chatId: string) => ({
      id: chatId,
      workspaceId: "p1",
    repoId: null,
      title: "Test Chat",
      provider: "claude" as const,
      sessionToken: null,
      planMode: false,
    }),
    getProject: (_workspaceId: string) => ({
      id: "p1",
      localPath: "/tmp/test-project",
      title: "Test Project",
    }),
    getMessages: (_chatId: string) => [],
    createChat: async (_workspaceId: string) => ({
      id: "new-chat-id",
      workspaceId: _workspaceId,
    repoId: null,
      title: "New Chat",
      provider: null,
      sessionToken: null,
      planMode: false,
    }),
    setChatProvider: async (chatId: string, provider: string) => {
      calls.push({ method: "setChatProvider", args: [chatId, provider] })
    },
    setChatModel: async (chatId: string, model: string | null) => {
      calls.push({ method: "setChatModel", args: [chatId, model] })
    },
    setPlanMode: async (chatId: string, planMode: boolean) => {
      calls.push({ method: "setPlanMode", args: [chatId, planMode] })
    },
    setSessionToken: async (chatId: string, token: string | null) => {
      calls.push({ method: "setSessionToken", args: [chatId, token] })
    },
    _calls: calls,
  } as unknown as RunnerProxyOptions["store"] & { _calls: typeof calls }
  return store
}

describe("RunnerProxy", () => {
  let natsServer: NatsServer | null = null
  let clientNc: NatsConnection | null = null
  let runnerNc: NatsConnection | null = null
  let proxy: RunnerProxy | null = null
  let mockRunner: ReturnType<typeof createMockRunner> | null = null

  afterEach(async () => {
    mockRunner?.dispose()
    mockRunner = null
    proxy = null
    if (clientNc && !clientNc.isClosed()) await clientNc.drain()
    clientNc = null
    if (runnerNc && !runnerNc.isClosed()) await runnerNc.drain()
    runnerNc = null
    if (natsServer) await natsServer.stop()
    natsServer = null
  })

  async function setup(overrides?: Partial<RunnerProxyOptions>) {
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })

    mockRunner = createMockRunner(runnerNc, RUNNER_ID)
    await runnerNc.flush()

    const activeStatuses = new Map<string, SessionStatus>()
    const store = createMockStore()

    proxy = new RunnerProxy({
      nc: clientNc,
      store,
      runnerId: RUNNER_ID,
      getActiveStatuses: () => activeStatuses,
      ...overrides,
    })

    return { activeStatuses, store }
  }

  test("send() with existing chatId forwards StartTurnCommand and persists model", async () => {
    const { store } = await setup()

    await proxy!.send({
      type: "chat.send",
      chatId: "chat-123",
      content: "Hello agent",
      model: "sonnet",
    })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.start_turn`)
    expect(msg.data).toMatchObject({
      chatId: "chat-123",
      provider: "claude",
      content: "Hello agent",
      model: "sonnet",
      workspaceLocalPath: "/tmp/test-project",
      appendUserPrompt: true,
    })

    const modelCall = store._calls.find((c) => c.method === "setChatModel")
    expect(modelCall).toEqual({ method: "setChatModel", args: ["chat-123", "sonnet"] })
  })

  test("send() without chatId creates chat first", async () => {
    await setup()

    const result = await proxy!.send({
      type: "chat.send",
      workspaceId: "p1",
      content: "New conversation",
    })

    expect(result.chatId).toBe("new-chat-id")
    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.data).toMatchObject({
      chatId: "new-chat-id",
      content: "New conversation",
    })
  })

  test("send() without chatId or workspaceId throws", async () => {
    await setup()

    await expect(
      proxy!.send({
        type: "chat.send",
        content: "No context",
      }),
    ).rejects.toThrow("Missing workspaceId")
  })

  test("cancel() forwards CancelTurnCommand", async () => {
    await setup()

    await proxy!.cancel("chat-456")

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.cancel_turn`)
    expect(msg.data).toEqual({ chatId: "chat-456" })
  })

  test("respondTool() forwards RespondToolCommand", async () => {
    await setup()

    await proxy!.respondTool({
      type: "chat.respondTool",
      chatId: "chat-789",
      toolUseId: "tool-1",
      result: "user approved",
    })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.respond_tool`)
    expect(msg.data).toEqual({
      chatId: "chat-789",
      toolUseId: "tool-1",
      result: "user approved",
    })
  })

  test("getActiveStatuses() delegates to provided function", async () => {
    const { activeStatuses } = await setup()

    activeStatuses.set("chat-a", "running")
    activeStatuses.set("chat-b", "idle")

    const result = proxy!.getActiveStatuses()
    expect(result.size).toBe(2)
    expect(result.get("chat-a")).toBe("running")
    expect(result.get("chat-b")).toBe("idle")
  })

  test("activeTurns.has() returns true for active chats", async () => {
    const { activeStatuses } = await setup()

    activeStatuses.set("active-chat", "running")

    expect(proxy!.activeTurns.has("active-chat")).toBe(true)
    expect(proxy!.activeTurns.has("inactive-chat")).toBe(false)
  })

  test("startTurnForChat() forwards StartTurnCommand and persists model", async () => {
    const { store } = await setup()

    await proxy!.startTurnForChat({
      chatId: "orch-chat",
      provider: "claude",
      content: "Orchestrated task",
      delegatedContext: "Forked parent chat context:\nUser: Investigate the auth race.",
      isSpawned: true,
      model: "sonnet",
      planMode: false,
      appendUserPrompt: true,
    })

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.start_turn`)
    expect(msg.data).toMatchObject({
      chatId: "orch-chat",
      provider: "claude",
      content: "Orchestrated task",
      delegatedContext: "Forked parent chat context:\nUser: Investigate the auth race.",
      isSpawned: true,
      model: "sonnet",
      planMode: false,
      appendUserPrompt: true,
      workspaceLocalPath: "/tmp/test-project",
    })

    const modelCall = store._calls.find((c) => c.method === "setChatModel")
    expect(modelCall).toEqual({ method: "setChatModel", args: ["orch-chat", "sonnet"] })
  })

  test("disposeChat() calls cancel and does not throw if cancel fails", async () => {
    await setup()

    // disposeChat calls cancel internally — should not throw even if runner errors
    await proxy!.disposeChat("chat-dispose")

    expect(mockRunner!.received).toHaveLength(1)
    const msg = mockRunner!.received[0] as { subject: string; data: Record<string, unknown> }
    expect(msg.subject).toBe(`runtime.runner.cmd.${RUNNER_ID}.cancel_turn`)
  })

  test("sendCommand throws on runner error response", async () => {
    // Set up a runner that returns errors
    natsServer = await NatsServer.start({})
    clientNc = await connect({ servers: natsServer.url })
    runnerNc = await connect({ servers: natsServer.url })

    const sub = runnerNc.subscribe(`runtime.runner.cmd.${RUNNER_ID}.>`)
    void (async () => {
      for await (const msg of sub) {
        msg.respond(
          encoder.encode(JSON.stringify({ ok: false, error: "Turn already active" })),
        )
      }
    })()
    await runnerNc.flush()

    proxy = new RunnerProxy({
      nc: clientNc,
      store: createMockStore(),
      runnerId: RUNNER_ID,
      getActiveStatuses: () => new Map(),
    })

    await expect(proxy.cancel("chat-err")).rejects.toThrow("Turn already active")

    sub.unsubscribe()
  })
})
