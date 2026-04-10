# Coordination MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose project coordination (todos, claims, worktrees, rules) as MCP tools available to Claude sessions via the existing `createSdkMcpServer` pattern.

**Architecture:** Single Tinkaria-level MCP server (`createCoordinationMcpServer`) that takes `store: EventStore` and exposes 12 tools. Each tool accepts `projectId` as a parameter — not scoped per-project. Tool handlers call EventStore mutation methods directly (in-process), then read back state to return the entity. Wired into `createClaudeOptions` in `claude-harness.ts` alongside the orchestration MCP server.

**Tech Stack:** Bun, TypeScript (strict), `@anthropic-ai/claude-agent-sdk` (`createSdkMcpServer`, `tool`), Zod v4 (`zod/v4`), Bun test

**ADR:** `adr-20260410-project-coordination-mcp` (C3)
**Spec:** `docs/superpowers/specs/2026-04-10-project-coordination-design.md`
**Depends on:** Sub-project 1 (durable project events) — all EventStore methods, types, and read model already exist.

---

### Task 1: Create Coordination MCP Server

**Files:**
- Create: `src/server/coordination-mcp.ts`
- Create: `src/server/coordination-mcp.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/server/coordination-mcp.test.ts`:

```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { createCoordinationMcpServer } from "./coordination-mcp"
import { EventStore } from "./event-store"
import { rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const TEST_DIR = join(import.meta.dir, ".test-coordination-mcp")

function createTestStore() {
  mkdirSync(TEST_DIR, { recursive: true })
  return new EventStore(TEST_DIR)
}

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe("createCoordinationMcpServer", () => {
  test("registers all 12 coordination tools", async () => {
    const store = createTestStore()
    await store.initialize()

    const server = createCoordinationMcpServer(store)
    const tools = Object.keys(
      (server.instance as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    )

    expect(tools).toEqual([
      "project_todo_add",
      "project_todo_claim",
      "project_todo_complete",
      "project_todo_abandon",
      "project_claim_create",
      "project_claim_release",
      "project_worktree_create",
      "project_worktree_assign",
      "project_worktree_remove",
      "project_rule_set",
      "project_rule_remove",
      "project_snapshot_get",
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/coordination-mcp.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create coordination-mcp.ts with all 12 tools**

Create `src/server/coordination-mcp.ts`:

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod/v4"
import { randomUUID } from "node:crypto"
import type { EventStore } from "./event-store"
import { deriveProjectCoordinationSnapshot } from "./read-models"

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

export function createCoordinationMcpServer(store: EventStore) {
  return createSdkMcpServer({
    name: "project-coordination",
    tools: [
      tool(
        "project_todo_add",
        "Add a shared todo to a project's coordination board. Returns the created todo.",
        {
          projectId: z.string().describe("The project ID"),
          description: z.string().describe("What needs to be done"),
          priority: z.enum(["high", "normal", "low"]).optional().describe("Priority level (default: normal)"),
          createdBy: z.string().optional().describe("Session or user creating the todo"),
        },
        async (args) => {
          const todoId = randomUUID()
          await store.addTodo(args.projectId, todoId, args.description, args.priority ?? "normal", args.createdBy ?? "unknown")
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.todos.get(todoId) ?? { id: todoId })
        },
      ),
      tool(
        "project_todo_claim",
        "Claim a todo for a session. Sets status to 'claimed'.",
        {
          projectId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to claim"),
          sessionId: z.string().describe("The session claiming the todo"),
        },
        async (args) => {
          await store.claimTodo(args.projectId, args.todoId, args.sessionId)
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.todos.get(args.todoId) ?? { id: args.todoId })
        },
      ),
      tool(
        "project_todo_complete",
        "Mark a todo as complete with optional output artifacts.",
        {
          projectId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to complete"),
          outputs: z.array(z.string()).optional().describe("Output file paths or artifact references"),
        },
        async (args) => {
          await store.completeTodo(args.projectId, args.todoId, args.outputs ?? [])
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.todos.get(args.todoId) ?? { id: args.todoId })
        },
      ),
      tool(
        "project_todo_abandon",
        "Abandon a todo. Sets status to 'abandoned'.",
        {
          projectId: z.string().describe("The project ID"),
          todoId: z.string().describe("The todo to abandon"),
        },
        async (args) => {
          await store.abandonTodo(args.projectId, args.todoId)
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.todos.get(args.todoId) ?? { id: args.todoId })
        },
      ),
      tool(
        "project_claim_create",
        "Declare intent to work on files. If files overlap with an existing active claim, the claim is created with 'conflict' status.",
        {
          projectId: z.string().describe("The project ID"),
          intent: z.string().describe("What you intend to do with these files"),
          files: z.array(z.string()).describe("File paths being claimed"),
          sessionId: z.string().describe("The session creating the claim"),
        },
        async (args) => {
          const claimId = randomUUID()
          await store.createClaim(args.projectId, claimId, args.intent, args.files, args.sessionId)
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.claims.get(claimId) ?? { id: claimId })
        },
      ),
      tool(
        "project_claim_release",
        "Release a file claim when done working on those files.",
        {
          projectId: z.string().describe("The project ID"),
          claimId: z.string().describe("The claim to release"),
        },
        async (args) => {
          await store.releaseClaim(args.projectId, args.claimId)
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.claims.get(args.claimId) ?? { id: args.claimId })
        },
      ),
      tool(
        "project_worktree_create",
        "Create a git worktree for isolated work on a branch.",
        {
          projectId: z.string().describe("The project ID"),
          branch: z.string().describe("Branch name for the worktree"),
          baseBranch: z.string().optional().describe("Base branch to create from (default: main)"),
        },
        async (args) => {
          const worktreeId = randomUUID()
          await store.createWorktree(args.projectId, worktreeId, args.branch, args.baseBranch ?? "main", "")
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.worktrees.get(worktreeId) ?? { id: worktreeId })
        },
      ),
      tool(
        "project_worktree_assign",
        "Assign a worktree to a session.",
        {
          projectId: z.string().describe("The project ID"),
          worktreeId: z.string().describe("The worktree to assign"),
          sessionId: z.string().describe("The session to assign to"),
        },
        async (args) => {
          await store.assignWorktree(args.projectId, args.worktreeId, args.sessionId)
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.worktrees.get(args.worktreeId) ?? { id: args.worktreeId })
        },
      ),
      tool(
        "project_worktree_remove",
        "Remove a worktree.",
        {
          projectId: z.string().describe("The project ID"),
          worktreeId: z.string().describe("The worktree to remove"),
        },
        async (args) => {
          await store.removeWorktree(args.projectId, args.worktreeId)
          return json({ ok: true, worktreeId: args.worktreeId })
        },
      ),
      tool(
        "project_rule_set",
        "Set a project rule or instruction that applies to all sessions.",
        {
          projectId: z.string().describe("The project ID"),
          ruleId: z.string().optional().describe("Rule ID (auto-generated if omitted)"),
          content: z.string().describe("The rule content"),
          setBy: z.string().optional().describe("Who set this rule"),
        },
        async (args) => {
          const ruleId = args.ruleId ?? randomUUID()
          await store.setRule(args.projectId, ruleId, args.content, args.setBy ?? "unknown")
          const coord = store.state.coordinationByProject.get(args.projectId)
          return json(coord?.rules.get(ruleId) ?? { id: ruleId })
        },
      ),
      tool(
        "project_rule_remove",
        "Remove a project rule.",
        {
          projectId: z.string().describe("The project ID"),
          ruleId: z.string().describe("The rule to remove"),
        },
        async (args) => {
          await store.removeRule(args.projectId, args.ruleId)
          return json({ ok: true, ruleId: args.ruleId })
        },
      ),
      tool(
        "project_snapshot_get",
        "Get the current coordination snapshot for a project — all active todos, claims, worktrees, and rules.",
        {
          projectId: z.string().describe("The project ID"),
        },
        async (args) => {
          const snapshot = deriveProjectCoordinationSnapshot(store.state, args.projectId)
          return json(snapshot)
        },
      ),
    ],
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/coordination-mcp.test.ts`
Expected: PASS — 1 test, 12 tools registered

- [ ] **Step 5: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/server/coordination-mcp.ts src/server/coordination-mcp.test.ts
git commit -m "feat: add coordination MCP server with 12 project tools"
```

---

### Task 2: Functional Tests for MCP Tool Handlers

**Files:**
- Modify: `src/server/coordination-mcp.test.ts`

- [ ] **Step 1: Add tool handler integration tests**

Append to `src/server/coordination-mcp.test.ts`:

```typescript
describe("coordination MCP tool handlers", () => {
  test("project_todo_add creates a todo and returns it", async () => {
    const store = createTestStore()
    await store.initialize()
    await store.openProject("proj-1", "/tmp/test", "Test")

    const server = createCoordinationMcpServer(store)
    const tools = (server.instance as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> })._registeredTools

    const result = await tools.project_todo_add.handler({
      projectId: "proj-1",
      description: "Fix the login bug",
      priority: "high",
      createdBy: "session-a",
    }) as { content: Array<{ text: string }> }

    const todo = JSON.parse(result.content[0].text)
    expect(todo.description).toBe("Fix the login bug")
    expect(todo.priority).toBe("high")
    expect(todo.status).toBe("open")
    expect(todo.createdBy).toBe("session-a")
    expect(todo.id).toBeDefined()
  })

  test("project_claim_create detects conflicts", async () => {
    const store = createTestStore()
    await store.initialize()
    await store.openProject("proj-1", "/tmp/test", "Test")

    const server = createCoordinationMcpServer(store)
    const tools = (server.instance as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> })._registeredTools

    // First claim
    await tools.project_claim_create.handler({
      projectId: "proj-1",
      intent: "Refactor auth",
      files: ["src/auth.ts", "src/login.ts"],
      sessionId: "s-1",
    })

    // Overlapping claim
    const result = await tools.project_claim_release.handler({
      projectId: "proj-1",
      claimId: "nonexistent",
    })

    // Create overlapping claim
    const conflictResult = await tools.project_claim_create.handler({
      projectId: "proj-1",
      intent: "Fix login",
      files: ["src/login.ts"],
      sessionId: "s-2",
    }) as { content: Array<{ text: string }> }

    const claim = JSON.parse(conflictResult.content[0].text)
    expect(claim.status).toBe("conflict")
    expect(claim.conflictsWith).toBeDefined()
  })

  test("project_snapshot_get returns full coordination state", async () => {
    const store = createTestStore()
    await store.initialize()
    await store.openProject("proj-1", "/tmp/test", "Test")

    const server = createCoordinationMcpServer(store)
    const tools = (server.instance as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> })._registeredTools

    await tools.project_todo_add.handler({
      projectId: "proj-1",
      description: "Task A",
    })
    await tools.project_rule_set.handler({
      projectId: "proj-1",
      content: "Use strict TypeScript",
    })

    const result = await tools.project_snapshot_get.handler({
      projectId: "proj-1",
    }) as { content: Array<{ text: string }> }

    const snapshot = JSON.parse(result.content[0].text)
    expect(snapshot.projectId).toBe("proj-1")
    expect(snapshot.todos).toHaveLength(1)
    expect(snapshot.rules).toHaveLength(1)
  })

  test("todo lifecycle: add → claim → complete", async () => {
    const store = createTestStore()
    await store.initialize()
    await store.openProject("proj-1", "/tmp/test", "Test")

    const server = createCoordinationMcpServer(store)
    const tools = (server.instance as unknown as { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }> })._registeredTools

    // Add
    const addResult = await tools.project_todo_add.handler({
      projectId: "proj-1",
      description: "Build feature X",
      createdBy: "s-1",
    }) as { content: Array<{ text: string }> }
    const todoId = JSON.parse(addResult.content[0].text).id

    // Claim
    const claimResult = await tools.project_todo_claim.handler({
      projectId: "proj-1",
      todoId,
      sessionId: "s-2",
    }) as { content: Array<{ text: string }> }
    expect(JSON.parse(claimResult.content[0].text).status).toBe("claimed")
    expect(JSON.parse(claimResult.content[0].text).claimedBy).toBe("s-2")

    // Complete
    const completeResult = await tools.project_todo_complete.handler({
      projectId: "proj-1",
      todoId,
      outputs: ["feature-x.ts"],
    }) as { content: Array<{ text: string }> }
    expect(JSON.parse(completeResult.content[0].text).status).toBe("complete")
    expect(JSON.parse(completeResult.content[0].text).outputs).toEqual(["feature-x.ts"])
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun test src/server/coordination-mcp.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/server/coordination-mcp.test.ts
git commit -m "test: add functional tests for coordination MCP tool handlers"
```

---

### Task 3: Wire MCP Server into Claude Harness

**Files:**
- Modify: `src/server/claude-harness.ts`

- [ ] **Step 1: Add import**

In `src/server/claude-harness.ts`, add import:

```typescript
import { createCoordinationMcpServer } from "./coordination-mcp"
import type { EventStore } from "./event-store"
```

- [ ] **Step 2: Add store parameter to createClaudeOptions and startClaudeTurn**

In the `createClaudeOptions` function args, add `store?: EventStore`:

```typescript
function createClaudeOptions(args: {
  localPath: string
  model: string
  effort?: string
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  orchestrator?: SessionOrchestrator
  chatId?: string
  store?: EventStore
}): ClaudeOptions {
```

Update the `mcpServers` construction to include coordination:

```typescript
const mcpServers: Record<string, McpServerConfig> = {}

if (args.orchestrator && args.chatId) {
  mcpServers["session-orchestration"] = createOrchestrationMcpServer(args.orchestrator, args.chatId)
}

if (args.store) {
  mcpServers["project-coordination"] = createCoordinationMcpServer(args.store)
}

return {
  cwd: args.localPath,
  model: resolveClaudeApiModelId(args.model),
  effort: args.effort as "low" | "medium" | "high" | "max" | undefined,
  resume: args.sessionToken ?? undefined,
  permissionMode: (args.planMode ? "plan" : "acceptEdits") as ClaudeOptions["permissionMode"],
  canUseTool: createClaudeCanUseTool(args.onToolRequest),
  tools: [...CLAUDE_TOOLSET],
  mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
  ...
```

In `startClaudeTurn` args, add `store?: EventStore`:

```typescript
export async function startClaudeTurn(args: {
  content: string
  localPath: string
  model: string
  effort?: string
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  orchestrator?: SessionOrchestrator
  chatId?: string
  store?: EventStore
  sdk?: ClaudeSdkBinding
}): Promise<HarnessTurn> {
```

The `args` object is passed directly to `createClaudeOptions(args)` so the new `store` field flows through automatically.

- [ ] **Step 3: Pass store from the server-side turn creation**

Find where `startClaudeTurn` is called with `orchestrator` (in the server, not the runner) and add `store`. Search for the call site — likely in `src/server/server.ts` or a session manager.

Run: `grep -rn "startClaudeTurn" src/server/ --include="*.ts"`

The runner's `TurnFactory` type does NOT include `store` — that's fine. The runner doesn't have direct store access. Coordination MCP is only available to server-managed sessions (same as orchestration MCP).

- [ ] **Step 4: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 5: Run existing tests**

Run: `bun test src/server/claude-turn.test.ts`
Expected: All existing tests PASS (they don't pass `store`, so coordination MCP is just absent — no regression)

- [ ] **Step 6: Commit**

```bash
git add src/server/claude-harness.ts
git commit -m "feat: wire coordination MCP server into Claude harness"
```

---

### Task 4: Pass EventStore to Harness from Server

**Files:**
- Modify: the file that calls `startClaudeTurn` on the server side (find via `grep -rn "startClaudeTurn\|orchestrator" src/server/ --include="*.ts"`)

- [ ] **Step 1: Identify the server-side call site**

Run: `grep -rn "startClaudeTurn\|createTurn\|orchestrator" src/runner/runner-agent.ts src/server/ --include="*.ts" | grep -v test | grep -v ".d.ts"`

Find where the orchestrator is passed. Add `store` at the same call site.

- [ ] **Step 2: Pass store alongside orchestrator**

At the call site where `orchestrator` is passed to `startClaudeTurn` or the turn factory, also pass `store`:

```typescript
store: eventStore, // or whatever the store variable is named at that scope
```

- [ ] **Step 3: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add <modified-file>
git commit -m "feat: pass EventStore to Claude harness for coordination MCP"
```

---

### Task 5: Final Typecheck + Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Full typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: Zero errors

- [ ] **Step 2: Full test suite**

Run: `bun test`
Expected: All tests PASS (pre-existing failures excluded)

- [ ] **Step 3: Run coordination MCP tests specifically**

Run: `bun test src/server/coordination-mcp.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 4: Verify MCP server is available in sessions**

Start the dev server and check that coordination tools appear:

```bash
bun run dev:server &
sleep 3
# The coordination MCP server should be registered — verify via logs or a test session
kill %1
```

- [ ] **Step 5: Final commit (if any remaining changes)**

```bash
git status
# If clean: done. If changes: commit with appropriate message.
```

---

## File Summary

| File | Action | Task |
|------|--------|------|
| `src/server/coordination-mcp.ts` | Create — 12 MCP tools wrapping EventStore methods | 1 |
| `src/server/coordination-mcp.test.ts` | Create — tool registration + 4 functional tests | 1, 2 |
| `src/server/claude-harness.ts` | Modify — add `store` param, wire coordination MCP server | 3 |
| Server-side turn call site | Modify — pass `store` to harness | 4 |
