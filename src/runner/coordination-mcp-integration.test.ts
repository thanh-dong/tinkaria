import { describe, test, expect, afterEach, beforeEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { EventStore } from "../server/event-store"
import { registerCommandResponders } from "../server/nats-responders"
import { NatsCoordinationClient } from "./nats-coordination-client"
import { createCoordinationMcpServer } from "../server/coordination-mcp"

describe("coordination MCP via runner NATS client", () => {
  let natsServer: NatsServer
  let serverNc: NatsConnection
  let clientNc: NatsConnection
  let store: EventStore
  let tmpDir: string
  let dispose: (() => void) | null = null

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "coord-mcp-int-test-"))
    natsServer = await NatsServer.start()
    serverNc = await connect({ servers: natsServer.url })
    clientNc = await connect({ servers: natsServer.url })

    store = new EventStore(tmpDir)
    await store.initialize()

    const { dispose: d } = registerCommandResponders({
      nc: serverNc,
      store,
      agent: {
        send: async () => ({ chatId: "c" }),
        cancel: async () => {},
        disposeChat: async () => {},
        respondTool: async () => {},
        getActiveStatuses: () => new Map(),
      } as never,
      terminals: {
        createTerminal: () => ({ terminalId: "t1", title: "bash", cwd: "/tmp", shell: "/bin/bash", cols: 80, rows: 24, scrollback: 0, serializedState: "", status: "running", exitCode: null }),
        write: () => {},
        resize: () => {},
        close: () => {},
        closeByCwd: () => {},
        getSnapshot: () => null,
        onEvent: () => () => {},
      } as never,
      refreshDiscovery: async () => [],
      updateManager: null,
      publisher: {
        addSubscription: () => {},
        removeSubscription: () => {},
        getSnapshot: async () => null,
        broadcastSnapshots: async () => {},
        publishChatMessage: () => {},
        refreshSessions: async () => {},
        dispose: () => {},
      } as never,
      onStateChange: () => {},
    })
    dispose = d
    await serverNc.flush()
  })

  afterEach(async () => {
    dispose?.()
    dispose = null
    await clientNc?.drain()
    await serverNc?.drain()
    await natsServer?.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("NatsCoordinationClient can add a todo via NATS and retrieve via getSnapshot", async () => {
    const project = await store.openProject("/tmp/test-coord-mcp-runner", "Test")
    const projectId = project.id

    const client = new NatsCoordinationClient(clientNc)

    await client.addTodo(projectId, "t-1", "Implement feature X", "high", "session-runner")

    // Verify via direct store (server-side truth)
    const serverSnapshot = await store.state.coordinationByProject.get(projectId)
    expect(serverSnapshot?.todos.get("t-1")?.description).toBe("Implement feature X")

    // Verify via getSnapshot (NATS round-trip)
    const snapshot = await client.getSnapshot(projectId)
    expect(snapshot.todos).toHaveLength(1)
    expect(snapshot.todos[0].description).toBe("Implement feature X")
    expect(snapshot.todos[0].status).toBe("open")
  })

  test("createCoordinationMcpServer works with NatsCoordinationClient", () => {
    const client = new NatsCoordinationClient(clientNc)
    const mcpServer = createCoordinationMcpServer(client)
    // The MCP server should be defined with tools
    expect(mcpServer).toBeDefined()
    expect(typeof mcpServer).toBe("object")
  })

  test("NatsCoordinationClient full coordination lifecycle via NATS", async () => {
    const project = await store.openProject("/tmp/test-coord-lifecycle", "Lifecycle")
    const projectId = project.id

    const client = new NatsCoordinationClient(clientNc)

    // Add and claim a todo
    await client.addTodo(projectId, "t-1", "Build feature", "normal", "session-a")
    await client.claimTodo(projectId, "t-1", "session-b")

    let snapshot = await client.getSnapshot(projectId)
    expect(snapshot.todos[0].status).toBe("claimed")

    // Complete the todo
    await client.completeTodo(projectId, "t-1", ["feature.ts"])
    snapshot = await client.getSnapshot(projectId)
    expect(snapshot.todos[0].status).toBe("complete")

    // Create a file claim
    await client.createClaim(projectId, "c-1", "Refactor auth", ["src/auth.ts"], "session-a")
    snapshot = await client.getSnapshot(projectId)
    expect(snapshot.claims).toHaveLength(1)
    expect(snapshot.claims[0].status).toBe("active")

    // Set a rule
    await client.setRule(projectId, "r-1", "No any types", "session-a")
    snapshot = await client.getSnapshot(projectId)
    expect(snapshot.rules).toHaveLength(1)
    expect(snapshot.rules[0].content).toBe("No any types")
  })
})
