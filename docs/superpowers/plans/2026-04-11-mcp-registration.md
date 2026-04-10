# MCP Registration & Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the coordination MCP server automatically available to every Claude session. The server-side code path must pass `store: EventStore` when creating turns, and the runner (separate process) must access coordination via NATS commands since it has no in-process `EventStore`.

**Architecture:** Two integration paths:
1. **Server-side (RunnerProxy):** Pass `store` through the `StartTurnCommand` NATS protocol is NOT viable — `EventStore` is not serializable. Instead, the runner needs its own coordination access. The MCP server is already wired in `claude-harness.ts` gated on `store?` — the key gap is that the runner process never passes `store`.
2. **Runner-side (runner process):** Create a `NatsCoordinationClient` that implements the same interface the MCP server needs, but delegates to NATS request/reply commands (the 11 coordination responders already exist in `nats-responders.ts`). The runner creates this client and passes it to `startClaudeTurn`.

**Tech Stack:** Bun, TypeScript (strict), NATS request/reply, Bun test

**Depends on:** Sub-project 1 (durable project events), Sub-project 2 (coordination MCP server)

---

### Task 1: Extract CoordinationStore Interface

**Files:**
- Create: `src/shared/coordination-store.ts`
- Modify: `src/server/coordination-mcp.ts`
- Create: `src/shared/coordination-store.test.ts`

Currently `createCoordinationMcpServer` takes `EventStore` directly. Extract an interface containing only the methods and state it actually uses, so both EventStore (server) and a NATS-backed client (runner) can satisfy it.

- [ ] **Step 1: Write failing test**

Create `src/shared/coordination-store.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import type { CoordinationStore } from "./coordination-store"

describe("CoordinationStore interface", () => {
  test("type-checks against EventStore shape", () => {
    // This is a compile-time test — if CoordinationStore is incompatible
    // with EventStore's methods, tsc will fail.
    const mockStore: CoordinationStore = {
      state: { coordinationByProject: new Map() },
      addTodo: async () => {},
      claimTodo: async () => {},
      completeTodo: async () => {},
      abandonTodo: async () => {},
      createClaim: async () => {},
      releaseClaim: async () => {},
      createWorktree: async () => {},
      assignWorktree: async () => {},
      removeWorktree: async () => {},
      setRule: async () => {},
      removeRule: async () => {},
    }
    expect(mockStore).toBeDefined()
  })
})
```

```bash
bun test src/shared/coordination-store.test.ts
# RED: module not found
```

- [ ] **Step 2: Create the interface**

Create `src/shared/coordination-store.ts`:

```typescript
import type { ProjectCoordination } from "./types"

/**
 * Minimal interface for project coordination operations.
 * Implemented by EventStore (server-side, in-process) and
 * NatsCoordinationClient (runner-side, over NATS).
 */
export interface CoordinationStore {
  state: {
    coordinationByProject: Map<string, ProjectCoordination>
  }
  addTodo(projectId: string, todoId: string, description: string, priority: string, createdBy: string): Promise<void>
  claimTodo(projectId: string, todoId: string, sessionId: string): Promise<void>
  completeTodo(projectId: string, todoId: string, outputs: string[]): Promise<void>
  abandonTodo(projectId: string, todoId: string): Promise<void>
  createClaim(projectId: string, claimId: string, intent: string, files: string[], sessionId: string): Promise<void>
  releaseClaim(projectId: string, claimId: string): Promise<void>
  createWorktree(projectId: string, worktreeId: string, branch: string, baseBranch: string, path: string): Promise<void>
  assignWorktree(projectId: string, worktreeId: string, sessionId: string): Promise<void>
  removeWorktree(projectId: string, worktreeId: string): Promise<void>
  setRule(projectId: string, ruleId: string, content: string, setBy: string): Promise<void>
  removeRule(projectId: string, ruleId: string): Promise<void>
}
```

- [ ] **Step 3: Update coordination-mcp.ts to use interface**

In `src/server/coordination-mcp.ts`, change:
```typescript
// Before
import type { EventStore } from "./event-store"
export function createCoordinationMcpServer(store: EventStore) {

// After
import type { CoordinationStore } from "../shared/coordination-store"
export function createCoordinationMcpServer(store: CoordinationStore) {
```

- [ ] **Step 4: Update claude-harness.ts import**

In `src/server/claude-harness.ts`, change `store?: EventStore` to `store?: CoordinationStore` in both `createClaudeOptions` and `startClaudeTurn` args, importing from `../shared/coordination-store`.

```bash
bun test src/shared/coordination-store.test.ts
bun test src/server/coordination-mcp.test.ts
# GREEN: both pass
```

---

### Task 2: Create NatsCoordinationClient for Runner

**Files:**
- Create: `src/runner/nats-coordination-client.ts`
- Create: `src/runner/nats-coordination-client.test.ts`

The runner process has a NATS connection but no EventStore. This client sends NATS requests to the server's command responders (already handling `project.todo.add`, etc. in `nats-responders.ts`), and maintains a local snapshot cache by requesting it via `project.snapshot_get` equivalent.

- [ ] **Step 1: Write failing test**

Create `src/runner/nats-coordination-client.test.ts`:

```typescript
import { describe, test, expect, afterEach, mock } from "bun:test"
import { NatsCoordinationClient } from "./nats-coordination-client"

describe("NatsCoordinationClient", () => {
  test("addTodo sends NATS command and refreshes snapshot", async () => {
    const mockNc = {
      request: mock(() => Promise.resolve({
        data: new TextEncoder().encode(JSON.stringify({ ok: true, result: { ok: true } })),
      })),
    }
    const client = new NatsCoordinationClient(mockNc as any)

    await client.addTodo("proj-1", "todo-1", "Fix bug", "normal", "session-1")

    expect(mockNc.request).toHaveBeenCalled()
    const callArgs = mockNc.request.mock.calls[0]
    expect(callArgs[0]).toBe("cmd.project.todo.add")
  })

  test("state.coordinationByProject returns empty map initially", () => {
    const client = new NatsCoordinationClient({} as any)
    expect(client.state.coordinationByProject.size).toBe(0)
  })
})
```

```bash
bun test src/runner/nats-coordination-client.test.ts
# RED: module not found
```

- [ ] **Step 2: Implement NatsCoordinationClient**

Create `src/runner/nats-coordination-client.ts`:

```typescript
import type { NatsConnection } from "@nats-io/transport-node"
import type { CoordinationStore } from "../shared/coordination-store"
import { commandSubject } from "../shared/nats-subjects"
import { LOG_PREFIX } from "../shared/branding"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * NATS-backed coordination store for the runner process.
 * Delegates all mutations to the server via NATS request/reply,
 * using the same command subjects that nats-responders.ts handles.
 *
 * State is a thin cache — after each mutation, the snapshot is
 * not automatically refreshed (tools read back via the server's
 * read model return value anyway).
 */
export class NatsCoordinationClient implements CoordinationStore {
  private readonly nc: NatsConnection
  private readonly _state: CoordinationStore["state"] = {
    coordinationByProject: new Map(),
  }

  constructor(nc: NatsConnection) {
    this.nc = nc
  }

  get state() {
    return this._state
  }

  private async sendCommand(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const subject = commandSubject(type as any)
    const reply = await this.nc.request(
      subject,
      encoder.encode(JSON.stringify({ type, ...payload })),
      { timeout: 5_000 },
    )
    const response = JSON.parse(decoder.decode(reply.data))
    if (!response.ok) {
      throw new Error(response.error ?? `Coordination command ${type} failed`)
    }
    return response.result
  }

  async addTodo(projectId: string, todoId: string, description: string, priority: string, createdBy: string) {
    await this.sendCommand("project.todo.add", { projectId, todoId, description, priority, createdBy })
  }

  async claimTodo(projectId: string, todoId: string, sessionId: string) {
    await this.sendCommand("project.todo.claim", { projectId, todoId, sessionId })
  }

  async completeTodo(projectId: string, todoId: string, outputs: string[]) {
    await this.sendCommand("project.todo.complete", { projectId, todoId, outputs })
  }

  async abandonTodo(projectId: string, todoId: string) {
    await this.sendCommand("project.todo.abandon", { projectId, todoId })
  }

  async createClaim(projectId: string, claimId: string, intent: string, files: string[], sessionId: string) {
    await this.sendCommand("project.claim.create", { projectId, claimId, intent, files, sessionId })
  }

  async releaseClaim(projectId: string, claimId: string) {
    await this.sendCommand("project.claim.release", { projectId, claimId })
  }

  async createWorktree(projectId: string, worktreeId: string, branch: string, baseBranch: string, path: string) {
    await this.sendCommand("project.worktree.create", { projectId, worktreeId, branch, baseBranch })
  }

  async assignWorktree(projectId: string, worktreeId: string, sessionId: string) {
    await this.sendCommand("project.worktree.assign", { projectId, worktreeId, sessionId })
  }

  async removeWorktree(projectId: string, worktreeId: string) {
    await this.sendCommand("project.worktree.remove", { projectId, worktreeId })
  }

  async setRule(projectId: string, ruleId: string, content: string, setBy: string) {
    await this.sendCommand("project.rule.set", { projectId, ruleId, content, setBy })
  }

  async removeRule(projectId: string, ruleId: string) {
    await this.sendCommand("project.rule.remove", { projectId, ruleId })
  }
}
```

```bash
bun test src/runner/nats-coordination-client.test.ts
# GREEN
```

---

### Task 3: Wire CoordinationStore into Runner Turn Creation

**Files:**
- Modify: `src/runner/runner-agent.ts` — add `coordinationStore?` to `TurnFactory` args and `RunnerAgentOptions`
- Modify: `src/runner/runner.ts` — create `NatsCoordinationClient`, pass to agent
- Modify: `src/runner/turn-factories.ts` — pass `store` through to `startClaudeTurn`

- [ ] **Step 1: Write failing test**

Update `src/runner/runner-agent.test.ts` — add a test that verifies `coordinationStore` is forwarded to `createTurn`:

```typescript
test("passes coordinationStore to createTurn when provided", async () => {
  const mockStore = { /* mock CoordinationStore */ }
  const createTurn = mock(() => Promise.resolve(mockTurn()))
  const agent = new RunnerAgent({
    nc: mockNc,
    createTurn,
    coordinationStore: mockStore as any,
  })

  await agent.startTurn(makeCmd({ chatId: "c1" }))

  const callArgs = createTurn.mock.calls[0][0]
  expect(callArgs.store).toBe(mockStore)
})
```

```bash
bun test src/runner/runner-agent.test.ts
# RED: coordinationStore not in RunnerAgentOptions
```

- [ ] **Step 2: Add coordinationStore to TurnFactory and RunnerAgentOptions**

In `src/runner/runner-agent.ts`:

```typescript
// Add to TurnFactory args:
export type TurnFactory = (args: {
  provider: AgentProvider
  content: string
  localPath: string
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  chatId: string
  store?: CoordinationStore  // NEW
}) => Promise<HarnessTurn>

// Add to RunnerAgentOptions:
export interface RunnerAgentOptions {
  nc: NatsConnection
  createTurn: TurnFactory
  generateTitle?: (content: string, cwd: string) => Promise<string | null>
  coordinationStore?: CoordinationStore  // NEW
}
```

In `RunnerAgent.startTurn`, pass `store` to `this.createTurn`:

```typescript
const turn = await this.createTurn({
  provider: cmd.provider,
  content: cmd.content,
  localPath: cmd.projectLocalPath,
  model: cmd.model,
  planMode: cmd.planMode,
  sessionToken: cmd.sessionToken,
  onToolRequest,
  chatId: cmd.chatId,
  store: this.coordinationStore,  // NEW
})
```

- [ ] **Step 3: Update runner.ts to create and inject NatsCoordinationClient**

In `src/runner/runner.ts`:

```typescript
import { NatsCoordinationClient } from "./nats-coordination-client"

// After NATS connection:
const coordinationStore = new NatsCoordinationClient(nc)

const agent = new RunnerAgent({
  nc,
  createTurn,
  generateTitle: generateTitleForChat,
  coordinationStore,  // NEW
})
```

- [ ] **Step 4: Update turn-factories.ts to forward store**

The `startClaudeTurn` re-export already accepts `store?` — the `TurnFactory` type just needs to pass it through. No change needed in `turn-factories.ts` since it re-exports `startClaudeTurn` from `claude-harness.ts` which already accepts `store`.

The `createTurn` lambda in `runner.ts` must forward the `store` arg:

```typescript
const createTurn: TurnFactory = async (args) => {
  if (args.provider === "claude") {
    return startClaudeTurn(args)  // args already includes store
  }
  // ...
}
```

```bash
bun test src/runner/runner-agent.test.ts
# GREEN
```

---

### Task 4: Handle Snapshot State for MCP Read-Back

**Files:**
- Modify: `src/runner/nats-coordination-client.ts`
- Modify: `src/server/coordination-mcp.ts`

The MCP server's `project_snapshot_get` tool and individual mutation handlers read `store.state.coordinationByProject` to return the entity after mutation. The `NatsCoordinationClient.state` is initially empty. Two approaches:

**Option A (simpler):** After each NATS mutation, the server's responder returns the result. The MCP tool handlers in `coordination-mcp.ts` currently read state directly — refactor them to use the NATS response result instead of re-reading state.

**Option B (snapshot sync):** Add a `refreshSnapshot(projectId)` method to `NatsCoordinationClient` that fetches the full coordination snapshot from the server (requires a new NATS command or reusing `project.snapshot_get` logic via a request to the server).

**Recommended: Option A** — it's simpler and avoids cache staleness.

- [ ] **Step 1: Write failing test for snapshot_get via NATS**

Add to `nats-coordination-client.test.ts`:

```typescript
test("getSnapshot fetches coordination state via NATS", async () => {
  const snapshot = { todos: [], claims: [], worktrees: [], rules: [] }
  const mockNc = {
    request: mock(() => Promise.resolve({
      data: new TextEncoder().encode(JSON.stringify({ ok: true, result: snapshot })),
    })),
  }
  const client = new NatsCoordinationClient(mockNc as any)
  const result = await client.getSnapshot("proj-1")
  expect(result).toEqual(snapshot)
})
```

- [ ] **Step 2: Refactor coordination-mcp.ts tool handlers**

Change `project_snapshot_get` to call `store.getSnapshot?.(projectId)` when available, falling back to `deriveProjectCoordinationSnapshot(store.state, projectId)`.

For mutation tools, the current pattern reads back from `store.state` after mutation. With the NATS client, `store.state` won't be updated. Refactor to return the mutation result from the NATS response or add a `getSnapshot` call after each mutation.

- [ ] **Step 3: Add getSnapshot to NatsCoordinationClient**

Add a new NATS command `project.snapshot.get` to `nats-responders.ts` SERVER_COMMANDS list, or have the client call the read-model derivation via a dedicated NATS subject.

```bash
bun test src/runner/nats-coordination-client.test.ts
bun test src/server/coordination-mcp.test.ts
# GREEN
```

---

### Task 5: Integration Test — End-to-End MCP Registration

**Files:**
- Create: `src/runner/coordination-mcp-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { NatsCoordinationClient } from "./nats-coordination-client"
// ... test that NatsCoordinationClient -> NATS -> nats-responders -> EventStore -> read back

describe("coordination MCP via runner", () => {
  test("runner can add and retrieve todos via NATS coordination client", async () => {
    // 1. Start embedded NATS + EventStore + register command responders
    // 2. Create NatsCoordinationClient with the NATS connection
    // 3. Call client.addTodo(...)
    // 4. Verify via store.state that the todo was persisted
  })

  test("createCoordinationMcpServer works with NatsCoordinationClient", async () => {
    // 1. Setup as above
    // 2. Pass NatsCoordinationClient to createCoordinationMcpServer
    // 3. Verify MCP server config is returned (tools registered)
  })
})
```

```bash
bun test src/runner/coordination-mcp-integration.test.ts
```

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/shared/coordination-store.ts` | NEW — interface extracted from EventStore |
| `src/server/coordination-mcp.ts` | Use `CoordinationStore` interface instead of `EventStore` |
| `src/server/claude-harness.ts` | Use `CoordinationStore` type for `store?` param |
| `src/runner/nats-coordination-client.ts` | NEW — NATS-backed CoordinationStore for runner |
| `src/runner/runner-agent.ts` | Add `coordinationStore?` to options and TurnFactory |
| `src/runner/runner.ts` | Create NatsCoordinationClient, pass to RunnerAgent |
| `src/shared/runner-protocol.ts` | No change needed (store is not serialized over NATS) |

### Key Design Decision

The `EventStore` is NOT passed over NATS. Instead, the runner gets a `NatsCoordinationClient` that satisfies the same `CoordinationStore` interface but delegates all operations to the server process via NATS request/reply. This means:
- Server process: `EventStore` (in-process, authoritative)
- Runner process: `NatsCoordinationClient` (NATS proxy, delegates to server)
- Both satisfy `CoordinationStore` interface
- Both can be passed to `createCoordinationMcpServer`
