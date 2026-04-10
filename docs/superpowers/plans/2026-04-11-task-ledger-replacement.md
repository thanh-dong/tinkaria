# Task Ledger Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory `TaskLedger` with the durable EventStore coordination system. Tasks survive server restarts via JSONL-backed event sourcing instead of vanishing from a `Map`.

**Architecture:** `ProjectAgent` drops its `TaskLedger` dependency and takes `EventStore` + `projectId` instead. Task operations (`listTasks`, `claimTask`, `completeTask`) become thin wrappers around `EventStore.addTodo` / `EventStore.claimTodo` / `EventStore.completeTodo` / `EventStore.abandonTodo`, reading back from `store.state.coordinationByProject`. The `detectAbandoned` interval in `server.ts` is removed (coordination events are durable; abandonment can be handled by the coordination MCP or a future policy). HTTP routes and CLI remain unchanged in shape — only their backing implementation changes.

**Tech Stack:** Bun, TypeScript (strict), Bun test

**Depends on:** Sub-project 1 (durable coordination events + EventStore methods), Sub-project 2 (coordination MCP server — already built)

---

### Task 1: Update ProjectAgent to use EventStore instead of TaskLedger

**Files:**
- Edit: `src/server/project-agent.ts`
- Edit: `src/server/project-agent.test.ts`

- [ ] **Step 1: Write failing tests for EventStore-backed ProjectAgent**

Replace `src/server/project-agent.test.ts` — tests now construct `ProjectAgent` with an `EventStore` instead of `TaskLedger`:

```typescript
// src/server/project-agent.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { ProjectAgent } from "./project-agent"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let tempDirs: string[] = []

async function createAgent() {
  const dir = await mkdtemp(path.join(tmpdir(), "pa-test-"))
  tempDirs.push(dir)
  const store = new EventStore(dir)
  await store.initialize()
  const sessions = new SessionIndex()
  const search = new TranscriptSearchIndex()
  const projectId = "p1"

  // Ensure project exists in store
  await store.openProject(projectId, "/tmp/test", "Test Project")

  const agent = new ProjectAgent({ sessions, store, search, projectId })
  return { agent, sessions, store, search, projectId }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

describe("ProjectAgent", () => {
  describe("querySessions", () => {
    test("returns sessions for project", async () => {
      const { agent } = await createAgent()
      const result = agent.querySessions("p1")
      expect(result).toEqual([])
    })
  })

  describe("searchWork", () => {
    test("delegates to transcript search", async () => {
      const { agent, search } = await createAgent()
      search.addEntry("chat-1", {
        _id: "1",
        createdAt: Date.now(),
        kind: "user_prompt",
        content: "implement auth middleware",
      } as never)

      const results = agent.searchWork("auth middleware", 10)
      expect(results.length).toBe(1)
    })
  })

  describe("claimTask", () => {
    test("creates task via EventStore coordination", async () => {
      const { agent } = await createAgent()
      const task = await agent.claimTask("implement auth", "chat-1", "feat/auth")
      expect(task.status).toBe("claimed")
      expect(task.description).toBe("implement auth")
      expect(task.claimedBy).toBe("chat-1")
    })
  })

  describe("completeTask", () => {
    test("completes task", async () => {
      const { agent } = await createAgent()
      const task = await agent.claimTask("task", "chat-1", null)
      const completed = await agent.completeTask(task.id, ["file.ts"])
      expect(completed).not.toBeNull()
      expect(completed!.status).toBe("complete")
      expect(completed!.outputs).toEqual(["file.ts"])
    })
  })

  describe("listTasks", () => {
    test("returns all todos as tasks", async () => {
      const { agent } = await createAgent()
      await agent.claimTask("a", "c1", null)
      await agent.claimTask("b", "c2", null)
      expect(agent.listTasks().length).toBe(2)
    })
  })

  describe("delegate", () => {
    test("returns task info for task query", async () => {
      const { agent } = await createAgent()
      await agent.claimTask("implement auth", "chat-1", "feat/auth")

      const result = await agent.delegate("who is working on auth?", "p1")
      expect(result.status).toBe("ok")
      expect(result.message).toContain("auth")
    })

    test("returns ok with summary when no data found", async () => {
      const { agent } = await createAgent()
      const result = await agent.delegate("what is going on?", "p1")
      expect(result.status).toBe("ok")
    })
  })
})
```

Run: `bun test src/server/project-agent.test.ts` — expect failures (ProjectAgent still takes TaskLedger).

- [ ] **Step 2: Rewrite ProjectAgent to use EventStore**

Replace `src/server/project-agent.ts`:

```typescript
// src/server/project-agent.ts
import type { ProjectTodo, SearchResult, DelegationResult } from "../shared/project-agent-types"
import type { SessionRecord } from "../shared/project-agent-types"
import type { SessionIndex } from "./session-index"
import type { EventStore } from "./event-store"
import type { TranscriptSearchIndex } from "./transcript-search"
import { randomUUID } from "node:crypto"

const TASK_KEYWORDS = ["task", "working on", "who", "claimed"]
const SEARCH_KEYWORDS = ["search", "find", "implemented", "where"]

interface ProjectAgentArgs {
  sessions: SessionIndex
  store: EventStore
  search: TranscriptSearchIndex
  projectId: string
}

export class ProjectAgent {
  private readonly sessions: SessionIndex
  private readonly store: EventStore
  private readonly search: TranscriptSearchIndex
  private readonly projectId: string

  constructor(args: ProjectAgentArgs) {
    this.sessions = args.sessions
    this.store = args.store
    this.search = args.search
    this.projectId = args.projectId
  }

  querySessions(projectId: string): SessionRecord[] {
    return this.sessions.getSessionsByProject(projectId)
  }

  getSessionSummary(chatId: string): SessionRecord | null {
    return this.sessions.getSession(chatId)
  }

  searchWork(query: string, limit: number): SearchResult[] {
    return this.search.search(query, limit)
  }

  listTasks(): ProjectTodo[] {
    const coord = this.store.state.coordinationByProject.get(this.projectId)
    if (!coord) return []
    return [...coord.todos.values()]
  }

  getTask(taskId: string): ProjectTodo | null {
    const coord = this.store.state.coordinationByProject.get(this.projectId)
    return coord?.todos.get(taskId) ?? null
  }

  async claimTask(description: string, ownedBy: string, _branch: string | null): Promise<ProjectTodo> {
    const todoId = randomUUID()
    await this.store.addTodo(this.projectId, todoId, description, "normal", ownedBy)
    await this.store.claimTodo(this.projectId, todoId, ownedBy)
    const coord = this.store.state.coordinationByProject.get(this.projectId)
    return coord!.todos.get(todoId)!
  }

  async completeTask(taskId: string, outputs: string[]): Promise<ProjectTodo | null> {
    const existing = this.getTask(taskId)
    if (!existing) return null
    await this.store.completeTodo(this.projectId, taskId, outputs)
    return this.getTask(taskId)
  }

  async abandonTask(taskId: string): Promise<ProjectTodo | null> {
    const existing = this.getTask(taskId)
    if (!existing) return null
    await this.store.abandonTodo(this.projectId, taskId)
    return this.getTask(taskId)
  }

  async delegate(request: string, projectId: string): Promise<DelegationResult> {
    const sessions = this.querySessions(projectId)
    const tasks = this.listTasks()
    const lower = request.toLowerCase()

    if (TASK_KEYWORDS.some((kw) => lower.includes(kw))) {
      if (tasks.length === 0) {
        return { status: "ok", message: "No tasks claimed." }
      }
      const summary = tasks.map((t) => `[${t.status}] "${t.description}" owned by ${t.claimedBy ?? t.createdBy}`).join("; ")
      return { status: "ok", message: summary, data: { tasks } }
    }

    if (SEARCH_KEYWORDS.some((kw) => lower.includes(kw))) {
      const searchResults = this.search.search(request, 5)
      if (searchResults.length === 0) {
        return { status: "ok", message: "No matching transcript entries found." }
      }
      const summary = searchResults.map((r) => `[${r.chatId}] ${r.fragment.slice(0, 100)}`).join("\n")
      return { status: "ok", message: summary, data: { searchResults } }
    }

    const parts: string[] = []
    if (sessions.length > 0) parts.push(`${sessions.length} session(s) active`)
    if (tasks.length > 0) parts.push(`${tasks.length} task(s) tracked`)
    return { status: "ok", message: parts.length > 0 ? parts.join(", ") + "." : "No project activity recorded yet." }
  }
}
```

Run: `bun test src/server/project-agent.test.ts` — expect green.

---

### Task 2: Update HTTP Routes for Async Task Operations

**Files:**
- Edit: `src/server/project-agent-routes.ts`
- Edit: `src/server/project-agent-routes.test.ts`

- [ ] **Step 1: Write failing route tests with EventStore**

Replace `src/server/project-agent-routes.test.ts`:

```typescript
// src/server/project-agent-routes.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { createProjectAgentRouter } from "./project-agent-routes"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let tempDirs: string[] = []

async function createRouter() {
  const dir = await mkdtemp(path.join(tmpdir(), "par-test-"))
  tempDirs.push(dir)
  const store = new EventStore(dir)
  await store.initialize()
  const sessions = new SessionIndex()
  const search = new TranscriptSearchIndex()
  const projectId = "p1"
  await store.openProject(projectId, "/tmp/test", "Test")
  const agent = new ProjectAgent({ sessions, store, search, projectId })
  const router = createProjectAgentRouter(agent)
  return { router, agent, sessions, store, search }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

describe("project-agent-routes", () => {
  test("GET /api/project/sessions returns JSON array", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/sessions?projectId=p1")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("POST /api/project/search returns results", async () => {
    const { router, search } = await createRouter()
    search.addEntry("c1", { _id: "1", createdAt: Date.now(), kind: "user_prompt", content: "auth setup" } as never)

    const req = new Request("http://localhost/api/project/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "auth", limit: 10 }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("GET /api/project/tasks returns task list", async () => {
    const { router, agent } = await createRouter()
    await agent.claimTask("test task", "c1", null)

    const req = new Request("http://localhost/api/project/tasks")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
  })

  test("POST /api/project/claim creates a task", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "implement auth", session: "c1", branch: "feat/auth" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("claimed")
  })

  test("POST /api/project/complete marks task done", async () => {
    const { router, agent } = await createRouter()
    const task = await agent.claimTask("task", "c1", null)

    const req = new Request("http://localhost/api/project/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, outputs: ["file.ts"] }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("complete")
  })

  test("POST /api/project/delegate returns delegation result", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "what is going on?", projectId: "p1" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  test("returns 404 for unknown routes", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/nonexistent")
    const res = await router(req)
    expect(res.status).toBe(404)
  })

  test("returns 400 for missing required fields", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await router(req)
    expect(res.status).toBe(400)
  })
})
```

Run: `bun test src/server/project-agent-routes.test.ts` — expect failures since `claimTask` / `completeTask` are now async.

- [ ] **Step 2: Update routes to await async operations**

In `src/server/project-agent-routes.ts`, the `claimTask` and `completeTask` calls become async:

```typescript
// In the /claim handler, change:
return jsonResponse(agent.claimTask(description, session, branch))
// to:
return jsonResponse(await agent.claimTask(description, session, branch))

// In the /complete handler, change:
const task = agent.completeTask(taskId, outputs)
// to:
const task = await agent.completeTask(taskId, outputs)

// In the /delegate handler — already async, no change needed
```

Run: `bun test src/server/project-agent-routes.test.ts` — expect green.

---

### Task 3: Update Integration Tests

**Files:**
- Edit: `src/server/project-agent-integration.test.ts`

- [ ] **Step 1: Rewrite integration test to use EventStore**

Replace `src/server/project-agent-integration.test.ts`:

```typescript
import { describe, expect, test, afterEach } from "bun:test"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"
import { createProjectAgentRouter } from "./project-agent-routes"
import type { TranscriptEntry } from "../shared/types"
import type { StoreState, ChatRecord } from "./events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let tempDirs: string[] = []

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "pai-test-"))
  tempDirs.push(dir)
  const store = new EventStore(dir)
  await store.initialize()
  const projectId = "p1"
  await store.openProject(projectId, "/tmp/p", "Test Project")

  // Add chats to store state for session index
  store.state.chatsById.set("c1", {
    id: "c1", projectId: "p1", title: "Chat 1", createdAt: Date.now(), updatedAt: Date.now(),
    unread: false, provider: "claude", planMode: false, sessionToken: null, lastTurnOutcome: null,
  } as ChatRecord)
  store.state.chatsById.set("c2", {
    id: "c2", projectId: "p1", title: "Chat 2", createdAt: Date.now(), updatedAt: Date.now(),
    unread: false, provider: "codex", planMode: false, sessionToken: null, lastTurnOutcome: null,
  } as ChatRecord)

  const sessions = new SessionIndex()
  const search = new TranscriptSearchIndex()
  const agent = new ProjectAgent({ sessions, store, search, projectId })
  const router = createProjectAgentRouter(agent)
  return { store, sessions, search, agent, router }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

describe("project agent integration", () => {
  test("end-to-end: messages -> indexes -> query via HTTP routes", async () => {
    const { store, sessions, search, router } = await setup()

    const e1 = timestamped({ kind: "user_prompt", content: "implement auth middleware with JWT" })
    const e2 = timestamped({ kind: "user_prompt", content: "fix CSS styling on the sidebar component" })
    sessions.onMessageAppended("c1", e1, store.state)
    sessions.onMessageAppended("c2", e2, store.state)
    search.addEntry("c1", e1)
    search.addEntry("c2", e2)

    // Query sessions via HTTP
    const sessionsRes = await router(new Request("http://localhost/api/project/sessions?projectId=p1"))
    expect(sessionsRes.status).toBe(200)
    const sessionsBody = await sessionsRes.json() as Array<Record<string, unknown>>
    expect(sessionsBody.length).toBe(2)

    // Search transcripts via HTTP
    const searchRes = await router(new Request("http://localhost/api/project/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "auth JWT middleware", limit: 5 }),
    }))
    const searchBody = await searchRes.json() as Array<Record<string, unknown>>
    expect(searchRes.status).toBe(200)
    expect(searchBody.length).toBeGreaterThanOrEqual(1)

    // Claim task via HTTP (now durable!)
    const claimRes = await router(new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "implement auth middleware", session: "c1", branch: "feat/auth" }),
    }))
    const claimBody = await claimRes.json() as Record<string, unknown>
    expect(claimRes.status).toBe(200)
    expect(claimBody.status).toBe("claimed")

    // List tasks via HTTP
    const tasksRes = await router(new Request("http://localhost/api/project/tasks"))
    const tasksBody = await tasksRes.json() as Array<Record<string, unknown>>
    expect(tasksBody.length).toBe(1)

    // Delegate via HTTP
    const delegateRes = await router(new Request("http://localhost/api/project/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "who is working on auth?", projectId: "p1" }),
    }))
    const delegateBody = await delegateRes.json() as Record<string, unknown>
    expect(delegateBody.status).toBe("ok")
    expect((delegateBody.message as string).toLowerCase()).toContain("auth")
  })

  test("complete task lifecycle via HTTP", async () => {
    const { router } = await setup()

    // Claim
    const claimRes = await router(new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "setup database", session: "c1", branch: null }),
    }))
    const claimed = await claimRes.json() as Record<string, unknown>
    expect(claimed.status).toBe("claimed")

    // Complete
    const completeRes = await router(new Request("http://localhost/api/project/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: claimed.id, outputs: ["migrations/001.sql"] }),
    }))
    const completed = await completeRes.json() as Record<string, unknown>
    expect(completed.status).toBe("complete")
    expect(completed.outputs).toEqual(["migrations/001.sql"])
  })
})
```

Run: `bun test src/server/project-agent-integration.test.ts` — expect green.

---

### Task 4: Update Server Wiring

**Files:**
- Edit: `src/server/server.ts`

- [ ] **Step 1: Replace TaskLedger with EventStore in server bootstrap**

In `src/server/server.ts`:

1. Remove import: `import { TaskLedger } from "./task-ledger"`
2. Remove: `const taskLedger = new TaskLedger()`
3. Remove the `abandonInterval` setInterval block (lines ~299-302)
4. Update `ProjectAgent` constructor to pass `store` (the existing `EventStore` instance) and a default `projectId`:

```typescript
// Replace the ProjectAgent construction block:
const projectAgent = new ProjectAgent({
  sessions: sessionIndex,
  store,           // the EventStore instance already created above
  search: transcriptSearch,
  projectId: "",   // empty string = global scope; routes can override per-request
})
```

5. Remove `clearInterval(abandonInterval)` from the cleanup/shutdown path if present.

Run: `bun run check` — expect clean typecheck + build.

---

### Task 5: Update CLI Help Text

**Files:**
- Edit: `src/server/project-cli.ts`

- [ ] **Step 1: Update help text to remove TaskLedger reference**

In `src/server/project-cli.ts`, line 84, change:

```
  tasks                       List all tasks in the TaskLedger
```

to:

```
  tasks                       List all project tasks
```

No test needed — cosmetic change.

---

### Task 6: Delete TaskLedger

**Files:**
- Delete: `src/server/task-ledger.ts`
- Delete: `src/server/task-ledger.test.ts`

- [ ] **Step 1: Remove files and verify no remaining imports**

```bash
rm src/server/task-ledger.ts src/server/task-ledger.test.ts
```

Run: `bun run check` — ensure no broken imports remain.

- [ ] **Step 2: Clean up TaskEntry type if unused**

In `src/shared/project-agent-types.ts`, the `TaskEntry` interface and `TaskStatus` type may now be unused. Check for remaining references:

```bash
grep -r 'TaskEntry\|TaskStatus' src/ --include='*.ts'
```

If no references remain outside the type file itself, remove the `TaskEntry` interface and `TaskStatus` type from `src/shared/project-agent-types.ts`.

Run: `bun test` — full suite green.

---

### Task 7: Verify Durability

- [ ] **Step 1: Write a durability smoke test**

Add to `src/server/project-agent-integration.test.ts`:

```typescript
test("tasks survive EventStore reload (durability)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "durable-"))
  tempDirs.push(dir)

  // First store instance: create a task
  const store1 = new EventStore(dir)
  await store1.initialize()
  await store1.openProject("p1", "/tmp/p", "Test")
  const agent1 = new ProjectAgent({
    sessions: new SessionIndex(),
    store: store1,
    search: new TranscriptSearchIndex(),
    projectId: "p1",
  })
  const task = await agent1.claimTask("durable task", "session-1", null)

  // Second store instance: reload from same directory
  const store2 = new EventStore(dir)
  await store2.initialize()
  const agent2 = new ProjectAgent({
    sessions: new SessionIndex(),
    store: store2,
    search: new TranscriptSearchIndex(),
    projectId: "p1",
  })

  const tasks = agent2.listTasks()
  expect(tasks.length).toBe(1)
  expect(tasks[0].description).toBe("durable task")
  expect(tasks[0].status).toBe("claimed")
  expect(tasks[0].id).toBe(task.id)
})
```

Run: `bun test src/server/project-agent-integration.test.ts` — expect green. This proves the core value proposition: tasks survive restarts.

---

### Summary of Changes

| File | Action | What changes |
|------|--------|-------------|
| `src/server/project-agent.ts` | Rewrite | Takes `EventStore` + `projectId` instead of `TaskLedger`. Task methods become async, delegate to EventStore coordination. |
| `src/server/project-agent-routes.ts` | Edit | `await` the now-async `claimTask` and `completeTask` calls. |
| `src/server/server.ts` | Edit | Remove `TaskLedger` import/instantiation, pass `store` to `ProjectAgent`, remove `abandonInterval`. |
| `src/server/project-cli.ts` | Edit | Remove "TaskLedger" from help text. |
| `src/server/task-ledger.ts` | Delete | Replaced by EventStore coordination. |
| `src/server/task-ledger.test.ts` | Delete | No longer needed. |
| `src/server/project-agent.test.ts` | Rewrite | Uses `EventStore` instead of `TaskLedger`. |
| `src/server/project-agent-routes.test.ts` | Rewrite | Uses `EventStore` instead of `TaskLedger`. |
| `src/server/project-agent-integration.test.ts` | Rewrite | Uses `EventStore`, adds durability test. |
| `src/shared/project-agent-types.ts` | Edit (maybe) | Remove `TaskEntry`/`TaskStatus` if unused. |
