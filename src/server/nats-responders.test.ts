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
    removeProject: async () => {},
    createChat: async (_projectId: string) => ({ id: "chat-1" }),
    renameChat: async () => {},
    deleteChat: async () => {},
    listChatsByProject: () => [{ id: "chat-1" }],
    getMessages: () => [],
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

function createMockKeybindings() {
  const snapshot = {
    bindings: {
      toggleEmbeddedTerminal: ["cmd+j"],
      toggleRightSidebar: ["ctrl+b"],
      openInFinder: ["cmd+alt+f"],
      openInEditor: ["cmd+shift+o"],
      addSplitTerminal: ["cmd+shift+j"],
    },
    warning: null,
    filePathDisplay: "~/.tinkaria/keybindings.json",
  }
  return {
    getSnapshot: () => snapshot,
    write: async () => snapshot,
    onChange: () => () => {},
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

function createMockDesktopRenderers() {
  return {
    register: ({ rendererId, machineName, capabilities }: { rendererId: string; machineName: string; capabilities: string[] }) => ({
      rendererId,
      machineName,
      capabilities,
      connectedAt: 100,
      lastSeenAt: 100,
    }),
    unregister: () => {},
    getSnapshot: () => ({ renderers: [] }),
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
    keybindings: createMockKeybindings() as never,
    refreshDiscovery: async () => [],
    getDiscoveredProjects: () => [],
    machineDisplayName: "Test Machine",
    updateManager: createMockUpdateManager() as never,
    publisher: {
      addSubscription: () => {},
      removeSubscription: () => {},
      getSnapshot: () => null,
      broadcastSnapshots: () => {},
      publishChatMessage: () => {},
      refreshSessions: async () => {},
      dispose: () => {},
    },
    desktopRenderers: createMockDesktopRenderers() as never,
    onStateChange: () => {},
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

  test("desktop.register returns the renderer snapshot", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "desktop.register",
      rendererId: "desktop-1",
      machineName: "Workstation",
      capabilities: ["native_webview"],
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({
      rendererId: "desktop-1",
      machineName: "Workstation",
      capabilities: ["native_webview"],
      connectedAt: 100,
      lastSeenAt: 100,
    })
  })

  test("settings.readKeybindings returns snapshot", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, { type: "settings.readKeybindings" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual(createMockKeybindings().getSnapshot())
  })

  test("settings.readKeybindings does not trigger onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, { type: "settings.readKeybindings" })
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

  test("settings.writeKeybindings returns updated snapshot", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "settings.writeKeybindings",
      bindings: { toggleEmbeddedTerminal: ["ctrl+j"] },
    })
    expect(res.ok).toBe(true)
    expect(res.result).toBeDefined()
  })

  test("settings.writeKeybindings triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    await sendCommand(clientNc, {
      type: "settings.writeKeybindings",
      bindings: { toggleEmbeddedTerminal: ["ctrl+j"] },
    })
    expect(changed).toBe(true)
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
    const res = await sendCommand(clientNc, { type: "chat.create", projectId: "proj-1" })
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

  test("project.open returns projectId and triggers onStateChange", async () => {
    let changed = false
    const { clientNc } = await setup({ onStateChange: () => { changed = true } })
    const res = await sendCommand(clientNc, { type: "project.open", localPath: "/tmp/test-project" })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ projectId: "proj-1" })
    expect(changed).toBe(true)
  })

  test("project.create returns projectId", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "project.create",
      localPath: "/tmp/test-project",
      title: "Test",
    })
    expect(res.ok).toBe(true)
    expect(res.result).toEqual({ projectId: "proj-1" })
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
    const res = await sendCommand(clientNc, { type: "project.remove", projectId: "proj-1" })
    expect(res.ok).toBe(true)
    expect(disposed).toContain("chat-1")
    expect(changed).toBe(true)
  })

  test("terminal.create returns snapshot", async () => {
    const { clientNc } = await setup()
    const res = await sendCommand(clientNc, {
      type: "terminal.create",
      projectId: "proj-1",
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
      projectId: "nonexistent",
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

    const create = await sendCommand(clientNc, { type: "chat.create", projectId: "proj-1" })
    expect(create.ok).toBe(true)

    const read = await sendCommand(clientNc, { type: "settings.readKeybindings" })
    expect(read.ok).toBe(true)

    // Only chat.create should have triggered onStateChange
    expect(changeCount).toBe(1)
  })

  test("desktop-owned webview commands are not handled by the Bun responder", async () => {
    const { clientNc } = await setup()

    try {
      await clientNc.request(commandSubject("webview.open"), encode({
        type: "webview.open",
        webviewId: "preview",
        targetKind: "local-port",
        target: "http://127.0.0.1:3210",
        dockState: "docked",
      }), { timeout: 300 })
      expect.unreachable("webview.open should not be handled by the Bun responder")
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  test("snapshot.subscribe registers subscription and returns snapshot", async () => {
    let addCalled = false
    let addedId = ""
    const mockPublisher = {
      addSubscription: (id: string) => { addCalled = true; addedId = id },
      removeSubscription: () => {},
      getSnapshot: () => ({ mock: "snapshot" }),
      broadcastSnapshots: () => {},
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

  test("snapshot.unsubscribe removes subscription", async () => {
    let removedId = ""
    const mockPublisher = {
      addSubscription: () => {},
      removeSubscription: (id: string) => { removedId = id },
      getSnapshot: () => null,
      broadcastSnapshots: () => {},
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
      topic: { type: "keybindings" },
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
      topic: { type: "local-projects" },
    })
    expect(refreshed).toBe(true)
  })
})
