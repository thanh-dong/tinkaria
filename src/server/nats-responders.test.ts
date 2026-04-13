import { afterEach, describe, test, expect } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { registerCommandResponders, type RegisterRespondersArgs } from "./nats-responders"
import { commandSubject } from "../shared/nats-subjects"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(data: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(data))
}

function decode<T>(data: Uint8Array): T {
  return JSON.parse(decoder.decode(data)) as T
}

interface CommandResponse {
  ok: boolean
  result?: unknown
  error?: string
}

// --- Mocks ---

function createMockStore() {
  return {
    state: {},
    openProject: async (_path: string, _title?: string) => ({ id: "proj-1" }),
    getProject: (id: string) => (id === "proj-1" ? { id: "proj-1", localPath: "/tmp/test-project" } : null),
    getChat: (id: string) => (id === "chat-1"
      ? { id: "chat-1", workspaceId: "proj-1", provider: "codex", sessionToken: "session-1" }
      : null),
    removeProject: async () => {},
    createChat: async (_workspaceId: string) => ({ id: "chat-1" }),
    renameChat: async () => {},
    deleteChat: async () => {},
    listChatsByProject: () => [{ id: "chat-1" }],
    getMessages: () => [],
    getMessageCount: async () => 0,
  }
}

function createMockAgent() {
  return {
    send: async () => ({ chatId: "chat-1" }),
    cancel: async () => {},
    disposeChat: async () => {},
    respondTool: async () => {},
    getActiveStatuses: () => new Map(),
  }
}

function createMockTerminals() {
  return {
    createTerminal: (opts: { terminalId: string }) => ({
      terminalId: opts.terminalId,
      title: "bash",
      cwd: "/tmp",
      shell: "/bin/bash",
      cols: 80,
      rows: 24,
      scrollback: 1000,
      serializedState: "",
      status: "running",
      exitCode: null,
    }),
    write: () => {},
    resize: () => {},
    close: () => {},
    closeByCwd: () => {},
    getSnapshot: () => null,
    onEvent: () => () => {},
  }
}

function createMockUpdateManager() {
  const snapshot = {
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    status: "available" as const,
    updateAvailable: true,
    lastCheckedAt: Date.now(),
    error: null,
    installAction: "restart" as const,
  }
  return {
    checkForUpdates: async () => snapshot,
    installUpdate: async () => ({ success: true, version: "1.1.0" }),
    getSnapshot: () => snapshot,
    onChange: () => () => {},
  }
}

// --- Test infrastructure ---

let server: NatsServer | null = null
let serverNc: NatsConnection | null = null
let clientNc: NatsConnection | null = null
let disposeFn: (() => void) | null = null
let tempDir: string | null = null

afterEach(async () => {
  disposeFn?.()
  disposeFn = null
  if (clientNc) {
    await clientNc.drain()
    clientNc = null
  }
  if (serverNc) {
    await serverNc.drain()
    serverNc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

async function setup(overrides?: Partial<RegisterRespondersArgs>) {
  server = await NatsServer.start()
  serverNc = await connect({ servers: server.url })
  clientNc = await connect({ servers: server.url })

  const args: RegisterRespondersArgs = {
    nc: serverNc,
    store: createMockStore() as never,
    agent: createMockAgent() as never,
    terminals: createMockTerminals() as never,
    refreshDiscovery: async () => [],
    getDiscoveredProjects: () => [],
    machineDisplayName: "Test Machine",
    updateManager: createMockUpdateManager() as never,
    publisher: {
      addSubscription: () => {},
      removeSubscription: () => {},
      getSnapshot: async () => null,
      broadcastSnapshots: async () => {},
      publishChatMessage: () => {},
      dispose: () => {},
    },
    onStateChange: () => {},
    directoryPolicy: null,
    repoManager: null,
    clonePolicy: null,
    workflowEngine: null,
    workflowStore: null,
    sandboxManager: null,
    ...overrides,
  }

  const { dispose } = registerCommandResponders(args)
  disposeFn = dispose

  // Allow subscription to propagate
  await serverNc.flush()

  return { clientNc: clientNc!, args }
}

async function sendCommand(nc: NatsConnection, command: unknown): Promise<CommandResponse> {
  const msg = await nc.request(commandSubject((command as { type: string }).type), encode(command), { timeout: 2000 })
  return decode<CommandResponse>(msg.data)
}

// --- Tests ---

describe("nats-responders", () => {
  test("system.ping responds ok", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "system.ping" })
    expect(res.ok).toBe(true)
  })

  test("system.ping does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "system.ping" })
    expect(changed).toBe(false)
  })


  test("system.readLocalFilePreview returns local file content", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kanna-preview-"))
    const filePath = path.join(tempDir, "README.md")
    await writeFile(filePath, "# Preview\n")

    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "system.readLocalFilePreview", localPath: filePath })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({
      localPath: filePath,
      content: "# Preview\n",
    })
  })

  test("system.readLocalFilePreview does not trigger onStateChange", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kanna-preview-"))
    const filePath = path.join(tempDir, "README.md")
    await writeFile(filePath, "# Preview\n")

    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "system.readLocalFilePreview", localPath: filePath })
    expect(changed).toBe(false)
  })

  test("chat.getSessionRuntime returns null when the session file cannot be inspected", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "chat.getSessionRuntime", chatId: "chat-1" })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ runtime: null })
  })

  test("chat.getSessionRuntime does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "chat.getSessionRuntime", chatId: "chat-1" })
    expect(changed).toBe(false)
  })

  test("chat.generateForkPrompt returns a derived prompt from transcript context", async () => {
    const generateCalls: Array<{ intent: string; entries: unknown[]; cwd: string; preset?: string }> = []
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getMessages: () => [
          { kind: "user_prompt", content: "Investigate auth race", _id: "1", createdAt: 1 },
          { kind: "assistant_text", text: "Likely around session restore", _id: "2", createdAt: 2 },
        ],
      } as never,
      generateForkPrompt: async (intent, entries, cwd, preset) => {
        generateCalls.push({ intent, entries, cwd, preset })
        return "## Objective\nFix the auth race"
      },
    })

    const res = await sendCommand(clientNc, {
      type: "chat.generateForkPrompt",
      chatId: "chat-1",
      intent: "Focus on the regression test",
      preset: "tests",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ prompt: "## Objective\nFix the auth race" })
    expect(generateCalls).toEqual([
      {
        intent: "Focus on the regression test",
        entries: [
          { kind: "user_prompt", content: "Investigate auth race", _id: "1", createdAt: 1 },
          { kind: "assistant_text", text: "Likely around session restore", _id: "2", createdAt: 2 },
        ],
        cwd: "/tmp/test-project",
        preset: "tests",
      },
    ])
  })

  test("chat.generateMergePrompt returns a synthesized prompt from multiple sessions", async () => {
    const mergeCalls: Array<{ intent: string; sessions: Array<{ chatId: string; entries: unknown[] }>; cwd: string; preset?: string }> = []
    const multiChatStore = {
      ...createMockStore(),
      getChat: (id: string) => {
        if (id === "chat-1" || id === "chat-2") return { id, workspaceId: "proj-1", provider: "claude", sessionToken: `session-${id}` }
        return null
      },
      getMessages: (chatId: string) => {
        if (chatId === "chat-1") return [{ kind: "user_prompt", content: "Session 1 work", _id: "1", createdAt: 1 }]
        if (chatId === "chat-2") return [{ kind: "assistant_text", text: "Session 2 output", _id: "2", createdAt: 2 }]
        return []
      },
    }

    const { clientNc } = await setup({
      store: multiChatStore as never,
      generateMergePrompt: async (intent, sessions, cwd, preset) => {
        mergeCalls.push({ intent, sessions, cwd, preset })
        return "## Merged\nCombined context from sessions"
      },
    })

    const res = await sendCommand(clientNc, {
      type: "chat.generateMergePrompt",
      chatIds: ["chat-1", "chat-2"],
      intent: "Synthesize findings",
      preset: "synthesis",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ prompt: "## Merged\nCombined context from sessions" })
    expect(mergeCalls).toHaveLength(1)
    expect(mergeCalls[0]!.intent).toBe("Synthesize findings")
    expect(mergeCalls[0]!.sessions).toHaveLength(2)
    expect(mergeCalls[0]!.cwd).toBe("/tmp/test-project")
    expect(mergeCalls[0]!.preset).toBe("synthesis")
  })

  test("chat.generateMergePrompt rejects empty chatIds", async () => {
    const { clientNc } = await setup({
      generateMergePrompt: async () => "should not reach",
    })

    const res = await sendCommand(clientNc, {
      type: "chat.generateMergePrompt",
      chatIds: [],
      intent: "Merge this",
    })

    expect(res.ok).toBe(false)
    expect(res.error).toContain("At least 1 session")
  })

  test("chat.generateMergePrompt does not trigger onStateChange", async () => {
    let changed = false
    const multiChatStore = {
      ...createMockStore(),
      getChat: (id: string) => {
        if (id === "chat-1" || id === "chat-2") return { id, workspaceId: "proj-1", provider: "claude", sessionToken: `session-${id}` }
        return null
      },
    }
    const { clientNc } = await setup({
      store: multiChatStore as never,
      onStateChange: () => { changed = true },
      generateMergePrompt: async () => "merge seed",
    })
    await sendCommand(clientNc, { type: "chat.generateMergePrompt", chatIds: ["chat-1", "chat-2"], intent: "Merge these" })
    expect(changed).toBe(false)
  })

  test("chat.generateForkPrompt does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({
      onStateChange: () => { changed = true },
      generateForkPrompt: async () => "fork seed",
    })
    await sendCommand(clientNc, { type: "chat.generateForkPrompt", chatId: "chat-1", intent: "Fork this work" })
    expect(changed).toBe(false)
  })

  test("chat.getRepoStatus returns repo status for the active project", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "kanna-repo-status-"))
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getProject: (id: string) => (id === "proj-1" ? { id: "proj-1", localPath: tempDir! } : null),
      } as never,
    })

    const res = await sendCommand(clientNc, { type: "chat.getRepoStatus", chatId: "chat-1" })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({
      repoStatus: {
        localPath: tempDir,
        branch: null,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        ahead: 0,
        behind: 0,
        isRepo: false,
      },
    })
  })

  test("chat.getRepoStatus does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "chat.getRepoStatus", chatId: "chat-1" })
    expect(changed).toBe(false)
  })


  test("update.check returns snapshot when manager exists", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "update.check" })
    expect(res.ok).toBe(true)
    const result = res.result as { currentVersion: string; updateAvailable: boolean }
    expect(result.currentVersion).toBe("1.0.0")
    expect(result.updateAvailable).toBe(true)
  })

  test("update.check returns fallback when manager is null", async () => {
    const { clientNc } = await setup({ updateManager: null })
    const res = await sendCommand(clientNc, { type: "update.check" })
    expect(res.ok).toBe(true)
    const result = res.result as { currentVersion: string; status: string }
    expect(result.currentVersion).toBe("unknown")
    expect(result.status).toBe("error")
  })

  test("update.check does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "update.check" })
    expect(changed).toBe(false)
  })

  test("update.install returns result", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "update.install" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ success: true, version: "1.1.0" })
  })

  test("update.install errors when manager is null", async () => {
    const { clientNc } = await setup({ updateManager: null })
    const res = await sendCommand(clientNc, { type: "update.install" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Update manager unavailable.")
  })

  test("chat.create returns chatId and triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "chat.create", workspaceId: "proj-1" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ chatId: "chat-1" })
    expect(changed).toBe(true)
  })

  test("chat.rename triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "chat.rename", chatId: "chat-1", title: "New Title" })
    expect(res.ok).toBe(true)
    expect(changed).toBe(true)
  })

  test("chat.delete disposes agent runtime state then deletes", async () => {
    const disposed: string[] = []
    const deleted: string[] = []
    const mockAgent = {
      ...createMockAgent(),
      disposeChat: async (id: string) => { disposed.push(id) },
    }
    const mockStore = {
      ...createMockStore(),
      deleteChat: async (id: string) => { deleted.push(id) },
    }
    const { clientNc } = await setup({
      agent: mockAgent as never,
      store: mockStore as never,
    })
    const res = await sendCommand(clientNc, { type: "chat.delete", chatId: "chat-99" })
    expect(res.ok).toBe(true)
    expect(disposed).toEqual(["chat-99"])
    expect(deleted).toEqual(["chat-99"])
  })

  test("chat.send returns agent result", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "chat.send",
      chatId: "chat-1",
      content: "Hello",
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ chatId: "chat-1" })
  })

  test("chat.cancel calls agent.cancel", async () => {
    const cancelled: string[] = []
    const mockAgent = {
      ...createMockAgent(),
      cancel: async (id: string) => { cancelled.push(id) },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, { type: "chat.cancel", chatId: "chat-5" })
    expect(res.ok).toBe(true)
    expect(cancelled).toEqual(["chat-5"])
  })

  test("chat.respondTool calls agent.respondTool", async () => {
    const responses: unknown[] = []
    const mockAgent = {
      ...createMockAgent(),
      respondTool: async (cmd: unknown) => { responses.push(cmd) },
    }
    const { clientNc } = await setup({ agent: mockAgent as never })
    const res = await sendCommand(clientNc, {
      type: "chat.respondTool",
      chatId: "chat-1",
      toolUseId: "tool-1",
      result: { accepted: true },
    })
    expect(res.ok).toBe(true)
    expect(responses).toHaveLength(1)
  })

  test("project.open returns workspaceId and triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/test-project" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ workspaceId: "proj-1" })
    expect(changed).toBe(true)
  })

  test("project.create returns workspaceId", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "project.create",
      localPath: "/tmp/test-project",
      title: "Test",
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ workspaceId: "proj-1" })
  })

  test("project.remove disposes chats and triggers onStateChange", async () => {
    let changed = false
    const disposed: string[] = []
    const mockAgent = {
      ...createMockAgent(),
      disposeChat: async (id: string) => { disposed.push(id) },
    }
    const { clientNc } = await setup({
      agent: mockAgent as never,
      onStateChange: () => { changed = true },
    })
    const res = await sendCommand(clientNc, { type: "project.remove", workspaceId: "proj-1" })
    expect(res.ok).toBe(true)
    expect(disposed).toContain("chat-1")
    expect(changed).toBe(true)
  })

  test("terminal.create returns snapshot", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "terminal.create",
      workspaceId: "proj-1",
      terminalId: "term-1",
      cols: 80,
      rows: 24,
      scrollback: 1000,
    })
    expect(res.ok).toBe(true)
    const result = res.result as { terminalId: string }
    expect(result.terminalId).toBe("term-1")
  })

  test("terminal.create errors for missing project", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "terminal.create",
      workspaceId: "nonexistent",
      terminalId: "term-1",
      cols: 80,
      rows: 24,
      scrollback: 1000,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Project not found")
  })

  test("terminal.input does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "terminal.input", terminalId: "term-1", data: "ls\n" })
    expect(res.ok).toBe(true)
    expect(changed).toBe(false)
  })

  test("terminal.resize does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "terminal.resize", terminalId: "term-1", cols: 120, rows: 40 })
    expect(res.ok).toBe(true)
    expect(changed).toBe(false)
  })

  test("terminal.close triggers onStateChange (publishes null snapshot)", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "terminal.close", terminalId: "term-1" })
    expect(res.ok).toBe(true)
    expect(changed).toBe(true)
  })

  test("invalid JSON payload returns error", async () => {
    const { clientNc } = await setup()
    const msg = await clientNc.request(
      commandSubject("system.ping"),
      encoder.encode("not json{{{"),
      { timeout: 2000 },
    )
    const res = decode<CommandResponse>(msg.data)
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Invalid JSON payload")
  })

  test("missing command type returns error", async () => {
    const { clientNc } = await setup()
    const msg = await clientNc.request(
      commandSubject("system.ping"),
      encode({ foo: "bar" }),
      { timeout: 2000 },
    )
    const res = decode<CommandResponse>(msg.data)
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Missing command type")
  })

  test("command handler error returns ok:false with message", async () => {
    const mockStore = {
      ...createMockStore(),
      openProject: async () => { throw new Error("Disk full") },
    }
    const { clientNc } = await setup({ store: mockStore as never })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/fail" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Disk full")
  })

  test("non-Error throw returns stringified message", async () => {
    const mockStore = {
      ...createMockStore(),
      openProject: async () => { throw "string error" },
    }
    const { clientNc } = await setup({ store: mockStore as never })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/fail" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("string error")
  })

  test("dispose unsubscribes from commands", async () => {
    const { clientNc } = await setup()

    // Verify it works before dispose
    const before = await sendCommand(clientNc, { type: "system.ping" })
    expect(before.ok).toBe(true)

    // Dispose and verify requests timeout
    disposeFn?.()
    disposeFn = null

    try {
      await clientNc.request(commandSubject("system.ping"), encode({ type: "system.ping" }), { timeout: 300 })
      expect(true).toBe(false) // should not reach
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  test("multiple commands in sequence", async () => {
    let changeCount = 0
    const { clientNc } = await setup({ onStateChange: () => { changeCount++ } })

    const ping = await sendCommand(clientNc, { type: "system.ping" })
    expect(ping.ok).toBe(true)

    const create = await sendCommand(clientNc, { type: "chat.create", workspaceId: "proj-1" })
    expect(create.ok).toBe(true)

    const read = await sendCommand(clientNc, { type: "update.check" })
    expect(read.ok).toBe(true)

    // Only chat.create should have triggered onStateChange
    expect(changeCount).toBe(1)
  })

  test("snapshot.subscribe registers subscription and returns snapshot", async () => {
    let addCalled = false
    let addedId = ""
    const mockPublisher = {
      addSubscription: (id: string) => { addCalled = true; addedId = id },
      removeSubscription: () => {},
      getSnapshot: async () => ({ mock: "snapshot" }),
      broadcastSnapshots: async () => {},
      publishChatMessage: () => {},
      refreshSessions: async () => {},
      dispose: () => {},
    }
    const { clientNc } = await setup({ publisher: mockPublisher })
    const res = await sendCommand(clientNc, {
      type: "snapshot.subscribe",
      subscriptionId: "sub-1",
      topic: { type: "sidebar" },
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ mock: "snapshot" })
    expect(addCalled).toBe(true)
    expect(addedId).toBe("sub-1")
  })

  test("chat.getMessageCount returns the persisted transcript length", async () => {
    const { clientNc } = await setup({
      store: {
        ...createMockStore(),
        getMessageCount: async (chatId: string) => (chatId === "chat-1" ? 3 : 0),
      } as never,
    })

    const res = await sendCommand(clientNc, {
      type: "chat.getMessageCount",
      chatId: "chat-1",
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ messageCount: 3 })
  })

  test("snapshot.unsubscribe removes subscription", async () => {
    let removedId = ""
    const mockPublisher = {
      addSubscription: () => {},
      removeSubscription: (id: string) => { removedId = id },
      getSnapshot: async () => null,
      broadcastSnapshots: async () => {},
      publishChatMessage: () => {},
      refreshSessions: async () => {},
      dispose: () => {},
    }
    const { clientNc } = await setup({ publisher: mockPublisher })
    const res = await sendCommand(clientNc, {
      type: "snapshot.unsubscribe",
      subscriptionId: "sub-1",
    })
    expect(res.ok).toBe(true)
    expect(removedId).toBe("sub-1")
  })

  test("snapshot.subscribe does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, {
      type: "snapshot.subscribe",
      subscriptionId: "sub-1",
      topic: { type: "sidebar" },
    })
    expect(changed).toBe(false)
  })

  test("snapshot.subscribe with local-projects triggers refresh", async () => {
    let refreshed = false
    const { clientNc } = await setup({
      refreshDiscovery: async () => { refreshed = true; return [] },
    })
    await sendCommand(clientNc, {
      type: "snapshot.subscribe",
      subscriptionId: "sub-lp",
      topic: { type: "local-workspaces" },
    })
    expect(refreshed).toBe(true)
  })
})
