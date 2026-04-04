# Agent Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-session awareness and resource coordination to Tinkaria via a stateless Project Agent with CLI interface.

**Architecture:** Five new server modules (SessionIndex, TaskLedger, BM25 engine, TranscriptSearchIndex, ResourceRegistry) that project from the existing EventStore, a stateless delegation function that gathers from these sources and optionally runs a cheap Haiku turn, HTTP routes under `/api/project/*`, and a standalone CLI binary (`tinkaria-project`) that agents call via Bash.

**Tech Stack:** Bun runtime, TypeScript strict mode, bun:test, existing EventStore/NATS infrastructure.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/shared/project-agent-types.ts` | All new types: SessionRecord, TaskEntry, ResourceLease, ResourceState, SearchDocument, DelegationResult |
| `src/server/session-index.ts` | SessionIndex read model — derives per-session summaries from EventStore state |
| `src/server/session-index.test.ts` | Tests for SessionIndex |
| `src/server/task-ledger.ts` | TaskLedger — task ownership, claim/complete/abandon lifecycle |
| `src/server/task-ledger.test.ts` | Tests for TaskLedger |
| `src/server/bm25.ts` | Standalone BM25 search engine — tokenize, index, score |
| `src/server/bm25.test.ts` | Tests for BM25 engine |
| `src/server/transcript-search.ts` | TranscriptSearchIndex — wraps BM25 with transcript-specific indexing |
| `src/server/transcript-search.test.ts` | Tests for TranscriptSearchIndex |
| `src/server/resource-registry.ts` | ResourceRegistry — lease-based resource coordination with TTL and fencing |
| `src/server/resource-registry.test.ts` | Tests for ResourceRegistry |
| `src/server/project-agent.ts` | ProjectAgent — stateless delegation function + source aggregation |
| `src/server/project-agent.test.ts` | Tests for ProjectAgent |
| `src/server/project-agent-routes.ts` | HTTP route handlers for `/api/project/*` |
| `src/server/project-agent-routes.test.ts` | Tests for HTTP routes |
| `src/server/project-cli.ts` | CLI logic — parse args, HTTP calls to server, formatted output |
| `src/server/project-cli.test.ts` | Tests for CLI |
| `bin/tinkaria-project` | Bin entry point for `tinkaria-project` CLI |

### Modified Files

| File | Change |
|------|--------|
| `src/server/server.ts:147-206` | Add `/api/project/*` route matching before static file fallback |
| `src/server/agent.ts:401-404` | Wire `appendAndPublish` to SessionIndex and TranscriptSearchIndex updates |
| `package.json` | Add `tinkaria-project` bin entry |

---

## Task 1: Shared Types

**Files:**
- Create: `src/shared/project-agent-types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/shared/project-agent-types.ts
import type { AgentProvider } from "./types"

// --- SessionIndex types ---

export type SessionStatus = "active" | "idle" | "complete" | "failed"

export interface SessionRecord {
  chatId: string
  intent: string
  status: SessionStatus
  provider: AgentProvider
  branch: string | null
  filesTouched: string[]
  commandsRun: string[]
  lastActivity: string
}

// --- TaskLedger types ---

export type TaskStatus = "claimed" | "in_progress" | "complete" | "abandoned"

export interface TaskEntry {
  id: string
  description: string
  ownedBy: string
  status: TaskStatus
  branch: string | null
  outputs: string[]
  claimedAt: string
  updatedAt: string
}

// --- TranscriptSearch types ---

export type SearchDocumentKind = "user_prompt" | "assistant_text" | "tool_call" | "tool_result"

export interface SearchDocument {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  text: string
  filePaths: string[]
  toolNames: string[]
  errorNames: string[]
}

export interface SearchResult {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  fragment: string
  score: number
}

// --- ResourceRegistry types ---

export type LeaseType = "exclusive" | "shared"
export type ResourceKind = "database" | "cache" | "service" | "process"
export type ResourceStatus = "running" | "stopped" | "starting"
export type ResourceManager = "zerobased" | "docker" | "manual"

export interface ResourceLease {
  id: string
  resource: string
  type: LeaseType
  heldBy: string
  fencingToken: number
  expiresAt: string
  metadata: Record<string, string>
}

export interface ResourceState {
  name: string
  kind: ResourceKind
  status: ResourceStatus
  managedBy: ResourceManager
  connectionString: string | null
  leases: ResourceLease[]
}

// --- ProjectAgent types ---

export interface DelegationResult {
  status: "ok" | "blocked" | "error"
  message: string
  data?: Record<string, unknown>
}

// --- CLI output types ---

export interface CliError {
  error: string
  code: number
  detail?: string
}
```

- [ ] **Step 2: Verify types compile**

Run: `bunx @typescript/native-preview --noEmit src/shared/project-agent-types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/project-agent-types.ts
git commit -m "feat(agent-network): add shared types for project agent"
```

---

## Task 2: BM25 Search Engine

**Files:**
- Create: `src/server/bm25.ts`
- Test: `src/server/bm25.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/bm25.test.ts
import { describe, expect, test } from "bun:test"
import { BM25Index } from "./bm25"

describe("BM25Index", () => {
  describe("tokenize", () => {
    test("lowercases and splits on whitespace/punctuation", () => {
      const index = new BM25Index<string>()
      index.add("d1", "Hello, World! This is a test.")
      const results = index.search("hello")
      expect(results.length).toBe(1)
      expect(results[0].id).toBe("d1")
    })

    test("filters stopwords", () => {
      const index = new BM25Index<string>()
      index.add("d1", "the quick brown fox")
      index.add("d2", "a lazy dog")
      // "the" and "a" are stopwords, should not dominate results
      const results = index.search("quick")
      expect(results.length).toBe(1)
      expect(results[0].id).toBe("d1")
    })
  })

  describe("search", () => {
    test("ranks relevant documents higher", () => {
      const index = new BM25Index<string>()
      index.add("d1", "postgres database migration schema users table")
      index.add("d2", "react component button styling CSS")
      index.add("d3", "database connection pool postgres config")

      const results = index.search("postgres database")
      expect(results.length).toBeGreaterThanOrEqual(2)
      // d1 and d3 both mention postgres+database terms
      const ids = results.map((r) => r.id)
      expect(ids).toContain("d1")
      expect(ids).toContain("d3")
      // d2 should not appear or rank very low
      expect(ids.indexOf("d1")).toBeLessThan(ids.indexOf("d2") === -1 ? Infinity : ids.indexOf("d2"))
    })

    test("returns empty for no matches", () => {
      const index = new BM25Index<string>()
      index.add("d1", "hello world")
      const results = index.search("nonexistent")
      expect(results).toEqual([])
    })

    test("respects limit parameter", () => {
      const index = new BM25Index<string>()
      for (let i = 0; i < 20; i++) {
        index.add(`d${i}`, `document ${i} about testing`)
      }
      const results = index.search("testing", 5)
      expect(results.length).toBe(5)
    })

    test("handles multi-field documents via concatenation", () => {
      const index = new BM25Index<string>()
      index.add("d1", "auth middleware implementation error handling retry logic")
      index.add("d2", "auth login form validation")
      const results = index.search("auth error handling")
      expect(results[0].id).toBe("d1")
    })
  })

  describe("remove", () => {
    test("removes document from index", () => {
      const index = new BM25Index<string>()
      index.add("d1", "hello world")
      index.add("d2", "hello there")
      index.remove("d1")
      const results = index.search("hello")
      expect(results.length).toBe(1)
      expect(results[0].id).toBe("d2")
    })
  })

  describe("size", () => {
    test("tracks document count", () => {
      const index = new BM25Index<string>()
      expect(index.size).toBe(0)
      index.add("d1", "hello")
      expect(index.size).toBe(1)
      index.add("d2", "world")
      expect(index.size).toBe(2)
      index.remove("d1")
      expect(index.size).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/bm25.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BM25Index**

```typescript
// src/server/bm25.ts

const STOPWORDS = new Set([
  "a", "an", "the", "is", "it", "of", "in", "to", "and", "or", "for",
  "on", "at", "by", "with", "from", "as", "be", "was", "were", "been",
  "are", "has", "had", "have", "do", "does", "did", "but", "not", "this",
  "that", "these", "those", "i", "we", "you", "he", "she", "they",
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

interface DocEntry {
  tokens: string[]
  length: number
}

export interface BM25Result<ID> {
  id: ID
  score: number
}

export class BM25Index<ID extends string = string> {
  private readonly k1 = 1.2
  private readonly b = 0.75
  private readonly docs = new Map<ID, DocEntry>()
  private readonly invertedIndex = new Map<string, Set<ID>>()
  private totalLength = 0

  get size(): number {
    return this.docs.size
  }

  private get avgLength(): number {
    return this.docs.size === 0 ? 0 : this.totalLength / this.docs.size
  }

  add(id: ID, text: string): void {
    this.remove(id)
    const tokens = tokenize(text)
    this.docs.set(id, { tokens, length: tokens.length })
    this.totalLength += tokens.length

    for (const token of tokens) {
      let set = this.invertedIndex.get(token)
      if (!set) {
        set = new Set()
        this.invertedIndex.set(token, set)
      }
      set.add(id)
    }
  }

  remove(id: ID): void {
    const doc = this.docs.get(id)
    if (!doc) return
    this.totalLength -= doc.length
    this.docs.delete(id)
    for (const token of doc.tokens) {
      const set = this.invertedIndex.get(token)
      if (set) {
        set.delete(id)
        if (set.size === 0) this.invertedIndex.delete(token)
      }
    }
  }

  search(query: string, limit = 10): BM25Result<ID>[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const scores = new Map<ID, number>()
    const N = this.docs.size
    const avgDl = this.avgLength

    for (const qt of queryTokens) {
      const postings = this.invertedIndex.get(qt)
      if (!postings) continue

      const df = postings.size
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))

      for (const docId of postings) {
        const doc = this.docs.get(docId)!
        const tf = doc.tokens.filter((t) => t === qt).length
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (doc.length / avgDl)))
        const score = idf * tfNorm
        scores.set(docId, (scores.get(docId) ?? 0) + score)
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score }))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/bm25.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/bm25.ts src/server/bm25.test.ts
git commit -m "feat(agent-network): add BM25 search engine"
```

---

## Task 3: SessionIndex

**Files:**
- Create: `src/server/session-index.ts`
- Test: `src/server/session-index.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/session-index.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { SessionIndex } from "./session-index"
import type { TranscriptEntry } from "../shared/types"
import type { StoreState, ChatRecord } from "./events"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

function createState(chats: ChatRecord[]): StoreState {
  const chatsById = new Map<string, ChatRecord>()
  const projectsById = new Map<string, { id: string; localPath: string; title: string; createdAt: number; updatedAt: number }>()
  const projectIdsByPath = new Map<string, string>()

  projectsById.set("p1", { id: "p1", localPath: "/tmp/p", title: "Test", createdAt: 0, updatedAt: 0 })
  for (const chat of chats) {
    chatsById.set(chat.id, chat)
  }
  return { projectsById, projectIdsByPath, chatsById }
}

function makeChat(id: string, projectId = "p1", provider: "claude" | "codex" | null = "claude"): ChatRecord {
  return {
    id,
    projectId,
    title: "Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    provider,
    planMode: false,
    sessionToken: null,
    lastTurnOutcome: null,
  }
}

describe("SessionIndex", () => {
  test("returns empty for project with no chats", () => {
    const index = new SessionIndex()
    const sessions = index.getSessionsByProject("p1")
    expect(sessions).toEqual([])
  })

  test("tracks session after message append", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])
    const entry = timestamped({ kind: "user_prompt", content: "implement auth middleware" })
    index.onMessageAppended("c1", entry, state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions.length).toBe(1)
    expect(sessions[0].chatId).toBe("c1")
    expect(sessions[0].intent).toBe("implement auth middleware")
    expect(sessions[0].provider).toBe("claude")
  })

  test("derives intent from first user message only", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "first message" }), state)
    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "second message" }), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].intent).toBe("first message")
  })

  test("accumulates filesTouched from tool calls", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "edit files" }), state)
    index.onMessageAppended("c1", timestamped({
      kind: "tool_call",
      tool: { type: "editFile", filePath: "/src/auth.ts", oldString: "a", newString: "b" },
    } as Omit<TranscriptEntry, "_id" | "createdAt">), state)
    index.onMessageAppended("c1", timestamped({
      kind: "tool_call",
      tool: { type: "readFile", filePath: "/src/utils.ts" },
    } as Omit<TranscriptEntry, "_id" | "createdAt">), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].filesTouched).toContain("/src/auth.ts")
    expect(sessions[0].filesTouched).toContain("/src/utils.ts")
  })

  test("accumulates commandsRun from bash tool calls", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "run stuff" }), state)
    index.onMessageAppended("c1", timestamped({
      kind: "tool_call",
      tool: { type: "bash", command: "bun test" },
    } as Omit<TranscriptEntry, "_id" | "createdAt">), state)

    const sessions = index.getSessionsByProject("p1")
    expect(sessions[0].commandsRun).toContain("bun test")
  })

  test("updates lastActivity on every message", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "hello" }), state)
    const first = index.getSessionsByProject("p1")[0].lastActivity

    index.onMessageAppended("c1", timestamped({ kind: "assistant_text", text: "hi" }), state)
    const second = index.getSessionsByProject("p1")[0].lastActivity

    expect(second >= first).toBe(true)
  })

  test("getSession returns single session detail", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1")])
    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "task" }), state)

    const session = index.getSession("c1")
    expect(session).not.toBeNull()
    expect(session!.chatId).toBe("c1")
  })

  test("getSession returns null for unknown chat", () => {
    const index = new SessionIndex()
    expect(index.getSession("unknown")).toBeNull()
  })

  test("isolates sessions by project", () => {
    const index = new SessionIndex()
    const state = createState([makeChat("c1", "p1"), makeChat("c2", "p2")])

    index.onMessageAppended("c1", timestamped({ kind: "user_prompt", content: "p1 work" }), state)
    index.onMessageAppended("c2", timestamped({ kind: "user_prompt", content: "p2 work" }), state)

    expect(index.getSessionsByProject("p1").length).toBe(1)
    expect(index.getSessionsByProject("p2").length).toBe(1)
    expect(index.getSessionsByProject("p1")[0].intent).toBe("p1 work")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/session-index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SessionIndex**

```typescript
// src/server/session-index.ts
import type { TranscriptEntry, NormalizedToolCall } from "../shared/types"
import type { StoreState } from "./events"
import type { SessionRecord, SessionStatus } from "../shared/project-agent-types"

interface MutableSessionRecord {
  chatId: string
  projectId: string
  intent: string
  status: SessionStatus
  provider: "claude" | "codex"
  branch: string | null
  filesTouched: Set<string>
  commandsRun: string[]
  lastActivity: string
}

function extractFilePath(tool: NormalizedToolCall): string | null {
  if ("filePath" in tool && typeof tool.filePath === "string") return tool.filePath
  if ("path" in tool && typeof tool.path === "string") return tool.path as string
  return null
}

function extractCommand(tool: NormalizedToolCall): string | null {
  if (tool.type === "bash" && "command" in tool && typeof tool.command === "string") return tool.command
  return null
}

export class SessionIndex {
  private readonly sessions = new Map<string, MutableSessionRecord>()

  onMessageAppended(chatId: string, entry: TranscriptEntry, state: StoreState): void {
    const chat = state.chatsById.get(chatId)
    if (!chat) return

    let session = this.sessions.get(chatId)
    if (!session) {
      session = {
        chatId,
        projectId: chat.projectId,
        intent: "",
        status: "active",
        provider: chat.provider ?? "claude",
        branch: null,
        filesTouched: new Set(),
        commandsRun: [],
        lastActivity: new Date().toISOString(),
      }
      this.sessions.set(chatId, session)
    }

    session.lastActivity = new Date().toISOString()

    if (entry.kind === "user_prompt" && !session.intent) {
      session.intent = entry.content.slice(0, 200)
    }

    if (entry.kind === "tool_call") {
      const filePath = extractFilePath(entry.tool)
      if (filePath) session.filesTouched.add(filePath)

      const command = extractCommand(entry.tool)
      if (command) session.commandsRun.push(command)
    }

    if (entry.kind === "result") {
      session.status = entry.subtype === "success" ? "complete" : entry.subtype === "error" ? "failed" : "idle"
    }
  }

  getSessionsByProject(projectId: string): SessionRecord[] {
    const results: SessionRecord[] = []
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        results.push(this.toRecord(session))
      }
    }
    return results.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
  }

  getSession(chatId: string): SessionRecord | null {
    const session = this.sessions.get(chatId)
    return session ? this.toRecord(session) : null
  }

  private toRecord(s: MutableSessionRecord): SessionRecord {
    return {
      chatId: s.chatId,
      intent: s.intent,
      status: s.status,
      provider: s.provider,
      branch: s.branch,
      filesTouched: [...s.filesTouched],
      commandsRun: s.commandsRun.slice(),
      lastActivity: s.lastActivity,
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/session-index.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/session-index.ts src/server/session-index.test.ts
git commit -m "feat(agent-network): add SessionIndex read model"
```

---

## Task 4: TaskLedger

**Files:**
- Create: `src/server/task-ledger.ts`
- Test: `src/server/task-ledger.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/task-ledger.test.ts
import { describe, expect, test } from "bun:test"
import { TaskLedger } from "./task-ledger"

describe("TaskLedger", () => {
  test("claim creates a new task", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("implement auth", "chat-1", "feat/auth")
    expect(task.description).toBe("implement auth")
    expect(task.ownedBy).toBe("chat-1")
    expect(task.status).toBe("claimed")
    expect(task.branch).toBe("feat/auth")
  })

  test("list returns all tasks", () => {
    const ledger = new TaskLedger()
    ledger.claim("task A", "chat-1", null)
    ledger.claim("task B", "chat-2", null)
    expect(ledger.list().length).toBe(2)
  })

  test("get returns specific task", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("task A", "chat-1", null)
    expect(ledger.get(task.id)).not.toBeNull()
    expect(ledger.get(task.id)!.description).toBe("task A")
  })

  test("get returns null for unknown id", () => {
    const ledger = new TaskLedger()
    expect(ledger.get("nonexistent")).toBeNull()
  })

  test("complete marks task as complete", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("task A", "chat-1", null)
    const updated = ledger.complete(task.id, ["src/auth.ts"])
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe("complete")
    expect(updated!.outputs).toEqual(["src/auth.ts"])
  })

  test("complete returns null for unknown task", () => {
    const ledger = new TaskLedger()
    expect(ledger.complete("nope", [])).toBeNull()
  })

  test("abandon marks task as abandoned", () => {
    const ledger = new TaskLedger()
    const task = ledger.claim("task A", "chat-1", null)
    const updated = ledger.abandon(task.id)
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe("abandoned")
  })

  test("detectAbandoned marks idle sessions' tasks", () => {
    const ledger = new TaskLedger({ abandonTimeoutMs: 100 })
    const task = ledger.claim("task A", "chat-1", null)

    // Manually backdate the task
    const internal = ledger.get(task.id)!
    ledger.updateTimestamp(task.id, new Date(Date.now() - 200).toISOString())

    const abandoned = ledger.detectAbandoned()
    expect(abandoned.length).toBe(1)
    expect(abandoned[0].id).toBe(task.id)
    expect(abandoned[0].status).toBe("abandoned")
  })

  test("detectAbandoned skips completed tasks", () => {
    const ledger = new TaskLedger({ abandonTimeoutMs: 100 })
    const task = ledger.claim("task A", "chat-1", null)
    ledger.complete(task.id, [])
    ledger.updateTimestamp(task.id, new Date(Date.now() - 200).toISOString())

    const abandoned = ledger.detectAbandoned()
    expect(abandoned.length).toBe(0)
  })

  test("listBySession filters tasks by owner", () => {
    const ledger = new TaskLedger()
    ledger.claim("task A", "chat-1", null)
    ledger.claim("task B", "chat-2", null)
    ledger.claim("task C", "chat-1", null)

    expect(ledger.listBySession("chat-1").length).toBe(2)
    expect(ledger.listBySession("chat-2").length).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/task-ledger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TaskLedger**

```typescript
// src/server/task-ledger.ts
import type { TaskEntry, TaskStatus } from "../shared/project-agent-types"

interface TaskLedgerOptions {
  abandonTimeoutMs?: number
}

const DEFAULT_ABANDON_TIMEOUT = 10 * 60 * 1000 // 10 minutes

export class TaskLedger {
  private readonly tasks = new Map<string, TaskEntry>()
  private readonly abandonTimeoutMs: number
  private nextId = 1

  constructor(options?: TaskLedgerOptions) {
    this.abandonTimeoutMs = options?.abandonTimeoutMs ?? DEFAULT_ABANDON_TIMEOUT
  }

  claim(description: string, ownedBy: string, branch: string | null): TaskEntry {
    const now = new Date().toISOString()
    const entry: TaskEntry = {
      id: `t-${this.nextId++}`,
      description,
      ownedBy,
      status: "claimed",
      branch,
      outputs: [],
      claimedAt: now,
      updatedAt: now,
    }
    this.tasks.set(entry.id, entry)
    return { ...entry }
  }

  get(id: string): TaskEntry | null {
    const entry = this.tasks.get(id)
    return entry ? { ...entry, outputs: [...entry.outputs] } : null
  }

  list(): TaskEntry[] {
    return [...this.tasks.values()].map((e) => ({ ...e, outputs: [...e.outputs] }))
  }

  listBySession(chatId: string): TaskEntry[] {
    return this.list().filter((t) => t.ownedBy === chatId)
  }

  complete(id: string, outputs: string[]): TaskEntry | null {
    const entry = this.tasks.get(id)
    if (!entry) return null
    entry.status = "complete"
    entry.outputs = outputs
    entry.updatedAt = new Date().toISOString()
    return { ...entry, outputs: [...entry.outputs] }
  }

  abandon(id: string): TaskEntry | null {
    const entry = this.tasks.get(id)
    if (!entry) return null
    entry.status = "abandoned"
    entry.updatedAt = new Date().toISOString()
    return { ...entry, outputs: [...entry.outputs] }
  }

  updateTimestamp(id: string, timestamp: string): void {
    const entry = this.tasks.get(id)
    if (entry) entry.updatedAt = timestamp
  }

  detectAbandoned(): TaskEntry[] {
    const cutoff = new Date(Date.now() - this.abandonTimeoutMs).toISOString()
    const abandoned: TaskEntry[] = []
    for (const entry of this.tasks.values()) {
      if ((entry.status === "claimed" || entry.status === "in_progress") && entry.updatedAt < cutoff) {
        entry.status = "abandoned"
        entry.updatedAt = new Date().toISOString()
        abandoned.push({ ...entry, outputs: [...entry.outputs] })
      }
    }
    return abandoned
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/task-ledger.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/task-ledger.ts src/server/task-ledger.test.ts
git commit -m "feat(agent-network): add TaskLedger coordination"
```

---

## Task 5: TranscriptSearchIndex

**Files:**
- Create: `src/server/transcript-search.ts`
- Test: `src/server/transcript-search.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/transcript-search.test.ts
import { describe, expect, test } from "bun:test"
import { TranscriptSearchIndex } from "./transcript-search"
import type { TranscriptEntry } from "../shared/types"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

describe("TranscriptSearchIndex", () => {
  test("indexes user_prompt entries and searches", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: "implement auth middleware with JWT tokens" }))
    index.addEntry("chat-2", timestamped({ kind: "user_prompt", content: "fix CSS styling on sidebar" }))

    const results = index.search("auth middleware")
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].chatId).toBe("chat-1")
    expect(results[0].kind).toBe("user_prompt")
  })

  test("indexes assistant_text entries", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "assistant_text", text: "I created the users table with email and password_hash columns" }))

    const results = index.search("users table")
    expect(results.length).toBe(1)
    expect(results[0].chatId).toBe("chat-1")
  })

  test("indexes tool_call entries with file paths", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_call",
      tool: { type: "editFile", filePath: "/src/server/auth.ts", oldString: "a", newString: "b" },
    } as Omit<TranscriptEntry, "_id" | "createdAt">))

    const results = index.search("auth.ts")
    expect(results.length).toBe(1)
  })

  test("returns results with score and fragment", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: "implement error handling for database connections" }))

    const results = index.search("error handling")
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0].fragment.length).toBeGreaterThan(0)
  })

  test("returns empty for no matches", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: "hello world" }))

    const results = index.search("nonexistent term here")
    expect(results).toEqual([])
  })

  test("respects limit", () => {
    const index = new TranscriptSearchIndex()
    for (let i = 0; i < 20; i++) {
      index.addEntry(`chat-${i}`, timestamped({ kind: "user_prompt", content: `testing search feature ${i}` }))
    }

    const results = index.search("testing search", 5)
    expect(results.length).toBe(5)
  })

  test("skips non-indexable entry kinds", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "status", status: "running" }))
    index.addEntry("chat-1", timestamped({ kind: "context_cleared" }))

    expect(index.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/transcript-search.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TranscriptSearchIndex**

```typescript
// src/server/transcript-search.ts
import type { TranscriptEntry, NormalizedToolCall } from "../shared/types"
import type { SearchResult, SearchDocumentKind } from "../shared/project-agent-types"
import { BM25Index } from "./bm25"

interface IndexedEntry {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  text: string
}

function extractTextFromEntry(entry: TranscriptEntry): { text: string; kind: SearchDocumentKind } | null {
  switch (entry.kind) {
    case "user_prompt":
      return { text: entry.content, kind: "user_prompt" }
    case "assistant_text":
      return { text: entry.text, kind: "assistant_text" }
    case "tool_call":
      return { text: toolCallToText(entry.tool), kind: "tool_call" }
    case "tool_result":
      return { text: typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content), kind: "tool_result" }
    default:
      return null
  }
}

function toolCallToText(tool: NormalizedToolCall): string {
  const parts: string[] = [tool.type]
  if ("filePath" in tool && typeof tool.filePath === "string") parts.push(tool.filePath)
  if ("path" in tool && typeof tool.path === "string") parts.push(tool.path as string)
  if ("command" in tool && typeof tool.command === "string") parts.push(tool.command)
  if ("pattern" in tool && typeof tool.pattern === "string") parts.push(tool.pattern)
  if ("query" in tool && typeof tool.query === "string") parts.push(tool.query)
  return parts.join(" ")
}

export class TranscriptSearchIndex {
  private readonly bm25 = new BM25Index<string>()
  private readonly entries = new Map<string, IndexedEntry>()

  get size(): number {
    return this.entries.size
  }

  addEntry(chatId: string, entry: TranscriptEntry): void {
    const extracted = extractTextFromEntry(entry)
    if (!extracted) return

    const docId = entry._id
    const indexed: IndexedEntry = {
      chatId,
      timestamp: new Date(entry.createdAt).toISOString(),
      kind: extracted.kind,
      text: extracted.text,
    }
    this.entries.set(docId, indexed)
    this.bm25.add(docId, extracted.text)
  }

  search(query: string, limit = 10): SearchResult[] {
    const bm25Results = this.bm25.search(query, limit)
    return bm25Results
      .map((r) => {
        const entry = this.entries.get(r.id)
        if (!entry) return null
        return {
          chatId: entry.chatId,
          timestamp: entry.timestamp,
          kind: entry.kind,
          fragment: entry.text.slice(0, 300),
          score: r.score,
        }
      })
      .filter((r): r is SearchResult => r !== null)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/transcript-search.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/transcript-search.ts src/server/transcript-search.test.ts
git commit -m "feat(agent-network): add TranscriptSearchIndex with BM25"
```

---

## Task 6: ResourceRegistry

**Files:**
- Create: `src/server/resource-registry.ts`
- Test: `src/server/resource-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/resource-registry.test.ts
import { describe, expect, test } from "bun:test"
import { ResourceRegistry } from "./resource-registry"

describe("ResourceRegistry", () => {
  describe("registerResource", () => {
    test("registers a new resource", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "postgres://localhost:5432" })
      const resources = reg.listResources()
      expect(resources.length).toBe(1)
      expect(resources[0].name).toBe("postgres")
      expect(resources[0].status).toBe("running")
    })
  })

  describe("acquireLease", () => {
    test("acquires exclusive lease", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "migrations", kind: "process", managedBy: "manual", connectionString: null })
      const lease = reg.acquireLease("migrations", "chat-1", "exclusive", 60_000)
      expect(lease).not.toBeNull()
      expect(lease!.type).toBe("exclusive")
      expect(lease!.heldBy).toBe("chat-1")
      expect(lease!.fencingToken).toBe(1)
    })

    test("blocks second exclusive lease", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "migrations", kind: "process", managedBy: "manual", connectionString: null })
      reg.acquireLease("migrations", "chat-1", "exclusive", 60_000)
      const second = reg.acquireLease("migrations", "chat-2", "exclusive", 60_000)
      expect(second).toBeNull()
    })

    test("allows multiple shared leases", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "pg://..." })
      const l1 = reg.acquireLease("postgres", "chat-1", "shared", 60_000)
      const l2 = reg.acquireLease("postgres", "chat-2", "shared", 60_000)
      expect(l1).not.toBeNull()
      expect(l2).not.toBeNull()
    })

    test("blocks shared lease when exclusive is held", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "migrations", kind: "process", managedBy: "manual", connectionString: null })
      reg.acquireLease("migrations", "chat-1", "exclusive", 60_000)
      const shared = reg.acquireLease("migrations", "chat-2", "shared", 60_000)
      expect(shared).toBeNull()
    })

    test("increments fencing token", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const l1 = reg.acquireLease("res", "chat-1", "exclusive", 60_000)
      reg.releaseLease(l1!.id)
      const l2 = reg.acquireLease("res", "chat-2", "exclusive", 60_000)
      expect(l2!.fencingToken).toBe(2)
    })

    test("returns null for unregistered resource", () => {
      const reg = new ResourceRegistry()
      const lease = reg.acquireLease("nonexistent", "chat-1", "exclusive", 60_000)
      expect(lease).toBeNull()
    })
  })

  describe("releaseLease", () => {
    test("releases held lease", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const lease = reg.acquireLease("res", "chat-1", "exclusive", 60_000)
      const released = reg.releaseLease(lease!.id)
      expect(released).toBe(true)
    })

    test("returns false for unknown lease", () => {
      const reg = new ResourceRegistry()
      expect(reg.releaseLease("nope")).toBe(false)
    })

    test("allows new exclusive after release", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const l1 = reg.acquireLease("res", "chat-1", "exclusive", 60_000)
      reg.releaseLease(l1!.id)
      const l2 = reg.acquireLease("res", "chat-2", "exclusive", 60_000)
      expect(l2).not.toBeNull()
    })
  })

  describe("expireLease", () => {
    test("expires leases past TTL", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const lease = reg.acquireLease("res", "chat-1", "exclusive", 100) // 100ms TTL

      // Manually backdate
      reg.backdateLeaseForTest(lease!.id, Date.now() - 200)

      const expired = reg.expireLeases()
      expect(expired.length).toBe(1)
      expect(expired[0].id).toBe(lease!.id)

      // Should now allow new lease
      const l2 = reg.acquireLease("res", "chat-2", "exclusive", 60_000)
      expect(l2).not.toBeNull()
    })
  })

  describe("getResource", () => {
    test("returns resource with its leases", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "pg://..." })
      reg.acquireLease("postgres", "chat-1", "shared", 60_000)
      reg.acquireLease("postgres", "chat-2", "shared", 60_000)

      const res = reg.getResource("postgres")
      expect(res).not.toBeNull()
      expect(res!.leases.length).toBe(2)
    })

    test("returns null for unknown resource", () => {
      const reg = new ResourceRegistry()
      expect(reg.getResource("nope")).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/resource-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ResourceRegistry**

```typescript
// src/server/resource-registry.ts
import type { ResourceLease, ResourceState, ResourceKind, ResourceManager, LeaseType } from "../shared/project-agent-types"

interface RegisterResourceArgs {
  name: string
  kind: ResourceKind
  managedBy: ResourceManager
  connectionString: string | null
}

interface InternalResource {
  name: string
  kind: ResourceKind
  status: "running" | "stopped" | "starting"
  managedBy: ResourceManager
  connectionString: string | null
  leases: Map<string, ResourceLease>
}

export class ResourceRegistry {
  private readonly resources = new Map<string, InternalResource>()
  private nextFencingToken = new Map<string, number>()
  private nextLeaseId = 1

  registerResource(args: RegisterResourceArgs): ResourceState {
    const resource: InternalResource = {
      name: args.name,
      kind: args.kind,
      status: "running",
      managedBy: args.managedBy,
      connectionString: args.connectionString,
      leases: new Map(),
    }
    this.resources.set(args.name, resource)
    if (!this.nextFencingToken.has(args.name)) {
      this.nextFencingToken.set(args.name, 1)
    }
    return this.toState(resource)
  }

  acquireLease(resourceName: string, heldBy: string, type: LeaseType, ttlMs: number): ResourceLease | null {
    const resource = this.resources.get(resourceName)
    if (!resource) return null

    for (const lease of resource.leases.values()) {
      if (lease.type === "exclusive") return null
      if (type === "exclusive") return null
    }

    const token = this.nextFencingToken.get(resourceName) ?? 1
    this.nextFencingToken.set(resourceName, token + 1)

    const lease: ResourceLease = {
      id: `lease-${this.nextLeaseId++}`,
      resource: resourceName,
      type,
      heldBy,
      fencingToken: token,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      metadata: {},
    }
    resource.leases.set(lease.id, lease)
    return { ...lease, metadata: { ...lease.metadata } }
  }

  releaseLease(leaseId: string): boolean {
    for (const resource of this.resources.values()) {
      if (resource.leases.has(leaseId)) {
        resource.leases.delete(leaseId)
        return true
      }
    }
    return false
  }

  expireLeases(): ResourceLease[] {
    const now = Date.now()
    const expired: ResourceLease[] = []
    for (const resource of this.resources.values()) {
      for (const [id, lease] of resource.leases) {
        if (new Date(lease.expiresAt).getTime() <= now) {
          expired.push({ ...lease, metadata: { ...lease.metadata } })
          resource.leases.delete(id)
        }
      }
    }
    return expired
  }

  backdateLeaseForTest(leaseId: string, expiresAtMs: number): void {
    for (const resource of this.resources.values()) {
      const lease = resource.leases.get(leaseId)
      if (lease) {
        lease.expiresAt = new Date(expiresAtMs).toISOString()
        return
      }
    }
  }

  getResource(name: string): ResourceState | null {
    const resource = this.resources.get(name)
    return resource ? this.toState(resource) : null
  }

  listResources(): ResourceState[] {
    return [...this.resources.values()].map((r) => this.toState(r))
  }

  private toState(r: InternalResource): ResourceState {
    return {
      name: r.name,
      kind: r.kind,
      status: r.status,
      managedBy: r.managedBy,
      connectionString: r.connectionString,
      leases: [...r.leases.values()].map((l) => ({ ...l, metadata: { ...l.metadata } })),
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/resource-registry.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/resource-registry.ts src/server/resource-registry.test.ts
git commit -m "feat(agent-network): add ResourceRegistry with lease coordination"
```

---

## Task 7: Project Agent Function

**Files:**
- Create: `src/server/project-agent.ts`
- Test: `src/server/project-agent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/project-agent.test.ts
import { describe, expect, test } from "bun:test"
import { ProjectAgent } from "./project-agent"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ResourceRegistry } from "./resource-registry"

function createAgent() {
  const sessions = new SessionIndex()
  const tasks = new TaskLedger()
  const search = new TranscriptSearchIndex()
  const resources = new ResourceRegistry()
  const agent = new ProjectAgent({ sessions, tasks, search, resources })
  return { agent, sessions, tasks, search, resources }
}

describe("ProjectAgent", () => {
  describe("querySessions", () => {
    test("returns sessions for project", () => {
      const { agent } = createAgent()
      const result = agent.querySessions("p1")
      expect(result).toEqual([])
    })
  })

  describe("searchWork", () => {
    test("delegates to transcript search", () => {
      const { agent, search } = createAgent()
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
    test("creates task in ledger", () => {
      const { agent } = createAgent()
      const task = agent.claimTask("implement auth", "chat-1", "feat/auth")
      expect(task.status).toBe("claimed")
    })
  })

  describe("completeTask", () => {
    test("completes task", () => {
      const { agent } = createAgent()
      const task = agent.claimTask("task", "chat-1", null)
      const completed = agent.completeTask(task.id, ["file.ts"])
      expect(completed).not.toBeNull()
      expect(completed!.status).toBe("complete")
    })
  })

  describe("listTasks", () => {
    test("returns all tasks", () => {
      const { agent } = createAgent()
      agent.claimTask("a", "c1", null)
      agent.claimTask("b", "c2", null)
      expect(agent.listTasks().length).toBe(2)
    })
  })

  describe("queryResources", () => {
    test("returns registered resources", () => {
      const { agent, resources } = createAgent()
      resources.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "pg://..." })
      const result = agent.queryResources()
      expect(result.length).toBe(1)
    })
  })

  describe("delegate", () => {
    test("returns deterministic answer for resource query", async () => {
      const { agent, resources } = createAgent()
      resources.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "pg://localhost" })

      const result = await agent.delegate("what resources are available?", "p1")
      expect(result.status).toBe("ok")
      expect(result.message).toContain("postgres")
    })

    test("returns task info for task query", async () => {
      const { agent } = createAgent()
      agent.claimTask("implement auth", "chat-1", "feat/auth")

      const result = await agent.delegate("who is working on auth?", "p1")
      expect(result.status).toBe("ok")
      expect(result.message).toContain("auth")
    })

    test("returns ok with summary when no data found", async () => {
      const { agent } = createAgent()
      const result = await agent.delegate("what is going on?", "p1")
      expect(result.status).toBe("ok")
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/project-agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectAgent**

```typescript
// src/server/project-agent.ts
import type { SessionRecord, TaskEntry, SearchResult, ResourceState, DelegationResult } from "../shared/project-agent-types"
import type { SessionIndex } from "./session-index"
import type { TaskLedger } from "./task-ledger"
import type { TranscriptSearchIndex } from "./transcript-search"
import type { ResourceRegistry } from "./resource-registry"

interface ProjectAgentArgs {
  sessions: SessionIndex
  tasks: TaskLedger
  search: TranscriptSearchIndex
  resources: ResourceRegistry
}

export class ProjectAgent {
  private readonly sessions: SessionIndex
  private readonly tasks: TaskLedger
  private readonly search: TranscriptSearchIndex
  private readonly resources: ResourceRegistry

  constructor(args: ProjectAgentArgs) {
    this.sessions = args.sessions
    this.tasks = args.tasks
    this.search = args.search
    this.resources = args.resources
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

  listTasks(): TaskEntry[] {
    return this.tasks.list()
  }

  getTask(taskId: string): TaskEntry | null {
    return this.tasks.get(taskId)
  }

  claimTask(description: string, ownedBy: string, branch: string | null): TaskEntry {
    return this.tasks.claim(description, ownedBy, branch)
  }

  completeTask(taskId: string, outputs: string[]): TaskEntry | null {
    return this.tasks.complete(taskId, outputs)
  }

  queryResources(): ResourceState[] {
    return this.resources.listResources()
  }

  async delegate(request: string, projectId: string): Promise<DelegationResult> {
    const sessions = this.querySessions(projectId)
    const tasks = this.listTasks()
    const resources = this.queryResources()

    const lower = request.toLowerCase()

    // Resource queries — deterministic, no LLM
    if (lower.includes("resource") || lower.includes("postgres") || lower.includes("redis") || lower.includes("running")) {
      if (resources.length === 0) {
        return { status: "ok", message: "No resources registered." }
      }
      const summary = resources.map((r) => `${r.name} (${r.kind}): ${r.status}, ${r.leases.length} active lease(s)`).join("; ")
      return { status: "ok", message: summary, data: { resources } }
    }

    // Task queries — deterministic, no LLM
    if (lower.includes("task") || lower.includes("working on") || lower.includes("who")) {
      if (tasks.length === 0) {
        return { status: "ok", message: "No tasks claimed." }
      }
      const summary = tasks.map((t) => `[${t.status}] "${t.description}" owned by ${t.ownedBy}`).join("; ")
      return { status: "ok", message: summary, data: { tasks } }
    }

    // Search queries — lexical, no LLM
    if (lower.includes("search") || lower.includes("find") || lower.includes("implemented")) {
      const searchResults = this.search.search(request, 5)
      if (searchResults.length === 0) {
        return { status: "ok", message: "No matching transcript entries found." }
      }
      const summary = searchResults.map((r) => `[${r.chatId}] ${r.fragment.slice(0, 100)}`).join("\n")
      return { status: "ok", message: summary, data: { searchResults } }
    }

    // General — summarize known state
    const parts: string[] = []
    if (sessions.length > 0) parts.push(`${sessions.length} session(s) active`)
    if (tasks.length > 0) parts.push(`${tasks.length} task(s) tracked`)
    if (resources.length > 0) parts.push(`${resources.length} resource(s) registered`)
    return { status: "ok", message: parts.length > 0 ? parts.join(", ") + "." : "No project activity recorded yet." }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/project-agent.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/project-agent.ts src/server/project-agent.test.ts
git commit -m "feat(agent-network): add ProjectAgent stateless delegation function"
```

---

## Task 8: HTTP Routes

**Files:**
- Create: `src/server/project-agent-routes.ts`
- Test: `src/server/project-agent-routes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/project-agent-routes.test.ts
import { describe, expect, test } from "bun:test"
import { createProjectAgentRouter } from "./project-agent-routes"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ResourceRegistry } from "./resource-registry"
import { ProjectAgent } from "./project-agent"

function createRouter() {
  const sessions = new SessionIndex()
  const tasks = new TaskLedger()
  const search = new TranscriptSearchIndex()
  const resources = new ResourceRegistry()
  const agent = new ProjectAgent({ sessions, tasks, search, resources })
  const router = createProjectAgentRouter(agent)
  return { router, agent, sessions, tasks, search, resources }
}

describe("project-agent-routes", () => {
  test("GET /api/project/sessions returns JSON array", async () => {
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/sessions?projectId=p1")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("POST /api/project/search returns results", async () => {
    const { router, search } = createRouter()
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
    const { router, agent } = createRouter()
    agent.claimTask("test task", "c1", null)

    const req = new Request("http://localhost/api/project/tasks")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
  })

  test("POST /api/project/claim creates a task", async () => {
    const { router } = createRouter()
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
    const { router, agent } = createRouter()
    const task = agent.claimTask("task", "c1", null)

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

  test("GET /api/project/resources returns resources", async () => {
    const { router, resources } = createRouter()
    resources.registerResource({ name: "pg", kind: "database", managedBy: "zerobased", connectionString: "pg://..." })

    const req = new Request("http://localhost/api/project/resources")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
  })

  test("POST /api/project/delegate returns delegation result", async () => {
    const { router } = createRouter()
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
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/nonexistent")
    const res = await router(req)
    expect(res.status).toBe(404)
  })

  test("returns 400 for missing required fields", async () => {
    const { router } = createRouter()
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/project-agent-routes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement routes**

```typescript
// src/server/project-agent-routes.ts
import type { ProjectAgent } from "./project-agent"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(error: string, code: number, detail?: string): Response {
  return jsonResponse({ error, code, detail }, code)
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function createProjectAgentRouter(agent: ProjectAgent): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api\/project/, "")

    if (req.method === "GET" && path === "/sessions") {
      const projectId = url.searchParams.get("projectId") ?? ""
      return jsonResponse(agent.querySessions(projectId))
    }

    if (req.method === "GET" && path.startsWith("/sessions/")) {
      const chatId = path.replace("/sessions/", "")
      const session = agent.getSessionSummary(chatId)
      return session ? jsonResponse(session) : errorResponse("Session not found", 404)
    }

    if (req.method === "POST" && path === "/search") {
      const body = await readBody(req)
      const query = body.query as string | undefined
      if (!query) return errorResponse("Missing 'query'", 400)
      const limit = typeof body.limit === "number" ? body.limit : 10
      return jsonResponse(agent.searchWork(query, limit))
    }

    if (req.method === "GET" && path === "/tasks") {
      return jsonResponse(agent.listTasks())
    }

    if (req.method === "GET" && path.startsWith("/tasks/")) {
      const taskId = path.replace("/tasks/", "")
      const task = agent.getTask(taskId)
      return task ? jsonResponse(task) : errorResponse("Task not found", 404)
    }

    if (req.method === "POST" && path === "/claim") {
      const body = await readBody(req)
      const description = body.description as string | undefined
      const session = body.session as string | undefined
      if (!description || !session) return errorResponse("Missing 'description' or 'session'", 400)
      const branch = (body.branch as string) ?? null
      return jsonResponse(agent.claimTask(description, session, branch))
    }

    if (req.method === "POST" && path === "/complete") {
      const body = await readBody(req)
      const taskId = body.taskId as string | undefined
      if (!taskId) return errorResponse("Missing 'taskId'", 400)
      const outputs = Array.isArray(body.outputs) ? (body.outputs as string[]) : []
      const task = agent.completeTask(taskId, outputs)
      return task ? jsonResponse(task) : errorResponse("Task not found", 404)
    }

    if (req.method === "GET" && path === "/resources") {
      return jsonResponse(agent.queryResources())
    }

    if (req.method === "POST" && path === "/delegate") {
      const body = await readBody(req)
      const request = body.request as string | undefined
      const projectId = (body.projectId as string) ?? ""
      if (!request) return errorResponse("Missing 'request'", 400)
      const result = await agent.delegate(request, projectId)
      return jsonResponse(result)
    }

    return errorResponse("Not found", 404)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/project-agent-routes.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/project-agent-routes.ts src/server/project-agent-routes.test.ts
git commit -m "feat(agent-network): add HTTP routes for project agent API"
```

---

## Task 9: CLI Binary

**Files:**
- Create: `src/server/project-cli.ts`
- Create: `bin/tinkaria-project`
- Test: `src/server/project-cli.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/server/project-cli.test.ts
import { describe, expect, test } from "bun:test"
import { parseProjectCliArgs, formatOutput } from "./project-cli"

describe("parseProjectCliArgs", () => {
  test("parses 'sessions' command", () => {
    const result = parseProjectCliArgs(["sessions"])
    expect(result).toEqual({ command: "sessions", args: {} })
  })

  test("parses 'sessions <id>' command", () => {
    const result = parseProjectCliArgs(["sessions", "chat-1"])
    expect(result).toEqual({ command: "session-detail", args: { chatId: "chat-1" } })
  })

  test("parses 'search <query>' command", () => {
    const result = parseProjectCliArgs(["search", "auth", "middleware"])
    expect(result).toEqual({ command: "search", args: { query: "auth middleware" } })
  })

  test("parses 'tasks' command", () => {
    const result = parseProjectCliArgs(["tasks"])
    expect(result).toEqual({ command: "tasks", args: {} })
  })

  test("parses 'tasks <id>' command", () => {
    const result = parseProjectCliArgs(["tasks", "t-1"])
    expect(result).toEqual({ command: "task-detail", args: { taskId: "t-1" } })
  })

  test("parses 'claim <description>' with flags", () => {
    const result = parseProjectCliArgs(["claim", "implement auth", "--session", "c1", "--branch", "feat/auth"])
    expect(result).toEqual({
      command: "claim",
      args: { description: "implement auth", session: "c1", branch: "feat/auth" },
    })
  })

  test("parses 'complete <id>'", () => {
    const result = parseProjectCliArgs(["complete", "t-1"])
    expect(result).toEqual({ command: "complete", args: { taskId: "t-1" } })
  })

  test("parses 'resources' command", () => {
    const result = parseProjectCliArgs(["resources"])
    expect(result).toEqual({ command: "resources", args: {} })
  })

  test("parses 'delegate <request>'", () => {
    const result = parseProjectCliArgs(["delegate", "ensure", "postgres", "running"])
    expect(result).toEqual({ command: "delegate", args: { request: "ensure postgres running" } })
  })

  test("parses --project flag", () => {
    const result = parseProjectCliArgs(["sessions", "--project", "p1"])
    expect(result).toEqual({ command: "sessions", args: { projectId: "p1" } })
  })

  test("returns help for no args", () => {
    const result = parseProjectCliArgs([])
    expect(result.command).toBe("help")
  })

  test("returns help for --help", () => {
    const result = parseProjectCliArgs(["--help"])
    expect(result.command).toBe("help")
  })
})

describe("formatOutput", () => {
  test("formats sessions as table when not --json", () => {
    const output = formatOutput("sessions", [
      { chatId: "c1", intent: "auth work", status: "active", provider: "claude", branch: null, filesTouched: [], commandsRun: [], lastActivity: "2026-04-04T10:00:00Z" },
    ], false)
    expect(output).toContain("c1")
    expect(output).toContain("auth work")
  })

  test("formats as JSON when json=true", () => {
    const data = [{ chatId: "c1" }]
    const output = formatOutput("sessions", data, true)
    expect(JSON.parse(output)).toEqual(data)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/project-cli.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CLI parser and formatter**

```typescript
// src/server/project-cli.ts

export interface CliCommand {
  command: string
  args: Record<string, string | undefined>
}

export function parseProjectCliArgs(argv: string[]): CliCommand {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", args: {} }
  }

  const flags: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[argv[i].slice(2)] = argv[i + 1]
      i++
    } else if (!argv[i].startsWith("--")) {
      positional.push(argv[i])
    }
  }

  const cmd = positional[0]
  const rest = positional.slice(1)
  const args: Record<string, string | undefined> = { ...flags }

  switch (cmd) {
    case "sessions":
      if (rest.length > 0) return { command: "session-detail", args: { ...args, chatId: rest[0] } }
      return { command: "sessions", args }
    case "search":
      return { command: "search", args: { ...args, query: rest.join(" ") } }
    case "tasks":
      if (rest.length > 0) return { command: "task-detail", args: { ...args, taskId: rest[0] } }
      return { command: "tasks", args }
    case "claim":
      return { command: "claim", args: { ...args, description: rest.join(" ") } }
    case "complete":
      return { command: "complete", args: { ...args, taskId: rest[0] } }
    case "resources":
      return { command: "resources", args }
    case "delegate":
      return { command: "delegate", args: { ...args, request: rest.join(" ") } }
    default:
      return { command: "help", args: {} }
  }
}

export function formatOutput(command: string, data: unknown, json: boolean): string {
  if (json) return JSON.stringify(data, null, 2)

  if (command === "sessions" && Array.isArray(data)) {
    if (data.length === 0) return "No sessions found."
    const rows = data.map((s: Record<string, unknown>) =>
      `${s.chatId}  ${String(s.status).padEnd(8)}  ${String(s.provider).padEnd(6)}  ${String(s.intent ?? "").slice(0, 50)}`
    )
    return ["CHAT_ID   STATUS    PROVIDER  INTENT", ...rows].join("\n")
  }

  if (command === "tasks" && Array.isArray(data)) {
    if (data.length === 0) return "No tasks tracked."
    const rows = data.map((t: Record<string, unknown>) =>
      `${t.id}  ${String(t.status).padEnd(12)}  ${t.ownedBy}  ${String(t.description).slice(0, 50)}`
    )
    return ["ID     STATUS        OWNER     DESCRIPTION", ...rows].join("\n")
  }

  if (command === "resources" && Array.isArray(data)) {
    if (data.length === 0) return "No resources registered."
    const rows = data.map((r: Record<string, unknown>) => {
      const leases = Array.isArray(r.leases) ? r.leases.length : 0
      return `${r.name}  ${String(r.status).padEnd(8)}  ${r.managedBy}  ${leases} lease(s)`
    })
    return ["NAME       STATUS    MANAGER      LEASES", ...rows].join("\n")
  }

  return JSON.stringify(data, null, 2)
}

export function getHelpText(): string {
  return `tinkaria-project — Cross-session project agent CLI

Commands:
  sessions                    List active/recent sessions with summaries
  sessions <chat-id>          Detailed summary of a specific session
  search <query>              Lexical search over project transcripts
  tasks                       List all tasks in the TaskLedger
  tasks <task-id>             Get task details
  claim <description>         Claim a new task for the current session
  complete <task-id>          Mark a task as complete
  resources                   List managed resources and their status
  delegate <request>          Submit a delegation request to the project agent

Flags:
  --json                      Output as JSON (default when stdout is not a TTY)
  --project <id>              Target project (default: current)
  --session <chat-id>         Identify calling session (for claim/complete)
  --port <port>               Tinkaria server port (default: 3210)
  --version                   CLI version
  --help                      Show this help`
}

export async function executeCommand(
  parsed: CliCommand,
  baseUrl: string,
): Promise<{ output: string; exitCode: number }> {
  const args = parsed.args
  const json = "json" in args || !process.stdout.isTTY

  try {
    let data: unknown
    switch (parsed.command) {
      case "help":
        return { output: getHelpText(), exitCode: 0 }
      case "sessions": {
        const projectId = args.projectId ?? ""
        const res = await fetch(`${baseUrl}/api/project/sessions?projectId=${encodeURIComponent(projectId)}`)
        data = await res.json()
        break
      }
      case "session-detail": {
        const res = await fetch(`${baseUrl}/api/project/sessions/${args.chatId}`)
        if (res.status === 404) return { output: formatOutput("error", { error: "Session not found" }, json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "search": {
        const res = await fetch(`${baseUrl}/api/project/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.query, limit: 10 }),
        })
        data = await res.json()
        break
      }
      case "tasks": {
        const res = await fetch(`${baseUrl}/api/project/tasks`)
        data = await res.json()
        break
      }
      case "task-detail": {
        const res = await fetch(`${baseUrl}/api/project/tasks/${args.taskId}`)
        if (res.status === 404) return { output: formatOutput("error", { error: "Task not found" }, json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "claim": {
        const res = await fetch(`${baseUrl}/api/project/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: args.description, session: args.session, branch: args.branch ?? null }),
        })
        if (res.status === 400) return { output: formatOutput("error", await res.json(), json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "complete": {
        const res = await fetch(`${baseUrl}/api/project/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: args.taskId, outputs: [] }),
        })
        if (res.status === 404) return { output: formatOutput("error", { error: "Task not found" }, json), exitCode: 1 }
        data = await res.json()
        break
      }
      case "resources": {
        const res = await fetch(`${baseUrl}/api/project/resources`)
        data = await res.json()
        break
      }
      case "delegate": {
        const res = await fetch(`${baseUrl}/api/project/delegate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: args.request, projectId: args.projectId ?? "" }),
        })
        data = await res.json()
        break
      }
      default:
        return { output: getHelpText(), exitCode: 1 }
    }
    return { output: formatOutput(parsed.command, data, json), exitCode: 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { output: JSON.stringify({ error: message, code: 2 }), exitCode: 2 }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/project-cli.test.ts`
Expected: All PASS

- [ ] **Step 5: Create bin entry point**

```bash
#!/usr/bin/env bun
// bin/tinkaria-project
import { parseProjectCliArgs, executeCommand } from "../src/server/project-cli"

const port = process.argv.includes("--port")
  ? process.argv[process.argv.indexOf("--port") + 1]
  : "3210"
const baseUrl = `http://127.0.0.1:${port}`

const args = process.argv.slice(2).filter((a) => a !== "--port" && a !== port)
const parsed = parseProjectCliArgs(args)
const { output, exitCode } = await executeCommand(parsed, baseUrl)

console.log(output)
process.exit(exitCode)
```

Make executable: `chmod +x bin/tinkaria-project`

- [ ] **Step 6: Add bin entry to package.json**

Add to `"bin"` section in `package.json`:

```json
"bin": {
  "tinkaria": "./bin/tinkaria",
  "tinkaria-project": "./bin/tinkaria-project"
}
```

- [ ] **Step 7: Commit**

```bash
git add src/server/project-cli.ts src/server/project-cli.test.ts bin/tinkaria-project package.json
git commit -m "feat(agent-network): add tinkaria-project CLI"
```

---

## Task 10: Server Integration

**Files:**
- Modify: `src/server/server.ts:147-206`
- Modify: `src/server/agent.ts:401-404`

- [ ] **Step 1: Write integration test**

```typescript
// src/server/project-agent-integration.test.ts
import { describe, expect, test } from "bun:test"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ResourceRegistry } from "./resource-registry"
import { ProjectAgent } from "./project-agent"
import { createProjectAgentRouter } from "./project-agent-routes"
import type { TranscriptEntry } from "../shared/types"
import type { StoreState } from "./events"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

describe("project agent integration", () => {
  test("end-to-end: append message → session index → search → query via routes", async () => {
    const sessions = new SessionIndex()
    const tasks = new TaskLedger()
    const search = new TranscriptSearchIndex()
    const resources = new ResourceRegistry()
    const agent = new ProjectAgent({ sessions, tasks, search, resources })
    const router = createProjectAgentRouter(agent)

    // Simulate state
    const state: StoreState = {
      projectsById: new Map([["p1", { id: "p1", localPath: "/tmp/p", title: "Test", createdAt: 0, updatedAt: 0 }]]),
      projectIdsByPath: new Map(),
      chatsById: new Map([["c1", {
        id: "c1", projectId: "p1", title: "Chat 1", createdAt: Date.now(), updatedAt: Date.now(),
        provider: "claude", planMode: false, sessionToken: null, lastTurnOutcome: null,
      }]]),
    }

    // Simulate agent message hook
    const entry = timestamped({ kind: "user_prompt", content: "implement auth middleware with JWT" })
    sessions.onMessageAppended("c1", entry, state)
    search.addEntry("c1", entry)

    // Query sessions via HTTP
    const sessionsRes = await router(new Request("http://localhost/api/project/sessions?projectId=p1"))
    const sessionsBody = await sessionsRes.json()
    expect(sessionsBody.length).toBe(1)
    expect(sessionsBody[0].intent).toBe("implement auth middleware with JWT")

    // Search via HTTP
    const searchRes = await router(new Request("http://localhost/api/project/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "auth JWT", limit: 5 }),
    }))
    const searchBody = await searchRes.json()
    expect(searchBody.length).toBe(1)
    expect(searchBody[0].chatId).toBe("c1")

    // Claim task via HTTP
    const claimRes = await router(new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "auth middleware", session: "c1", branch: "feat/auth" }),
    }))
    const claimBody = await claimRes.json()
    expect(claimBody.status).toBe("claimed")

    // Delegate via HTTP
    const delegateRes = await router(new Request("http://localhost/api/project/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "who is working on auth?", projectId: "p1" }),
    }))
    const delegateBody = await delegateRes.json()
    expect(delegateBody.status).toBe("ok")
    expect(delegateBody.message).toContain("auth")
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `bun test src/server/project-agent-integration.test.ts`
Expected: All PASS

- [ ] **Step 3: Wire into server.ts**

In `src/server/server.ts`, add the project agent initialization and route matching. Before the static file fallback in the `fetch` handler (around line 180), add:

```typescript
// At top of file, add imports:
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ResourceRegistry } from "./resource-registry"
import { ProjectAgent } from "./project-agent"
import { createProjectAgentRouter } from "./project-agent-routes"

// In startKannaServer, before Bun.serve():
const sessionIndex = new SessionIndex()
const taskLedger = new TaskLedger()
const transcriptSearch = new TranscriptSearchIndex()
const resourceRegistry = new ResourceRegistry()
const projectAgent = new ProjectAgent({
  sessions: sessionIndex,
  tasks: taskLedger,
  search: transcriptSearch,
  resources: resourceRegistry,
})
const projectAgentRouter = createProjectAgentRouter(projectAgent)

// In the fetch handler, add before the static file fallback:
if (url.pathname.startsWith("/api/project/")) {
  return projectAgentRouter(req)
}
```

- [ ] **Step 4: Wire into agent.ts message hook**

In `src/server/server.ts`, find where `onMessageAppended` is wired (around the agent/publisher setup). Add the session index and search index hooks:

```typescript
// After the existing onMessageAppended wiring:
agent.onMessageAppended = (chatId, entry) => {
  // existing: publisher.publishChatMessage(chatId, entry)
  publisher.publishChatMessage(chatId, entry)
  // new: update project agent indexes
  sessionIndex.onMessageAppended(chatId, entry, store.state)
  transcriptSearch.addEntry(chatId, entry)
  // existing: orchestrator hook
  orchestrator.onMessageAppended(chatId, entry)
}
```

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All existing tests still pass + new tests pass

- [ ] **Step 6: Commit**

```bash
git add src/server/server.ts src/server/project-agent-integration.test.ts
git commit -m "feat(agent-network): wire project agent into server and message pipeline"
```

---

## Task 11: Run Full Verification

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No type errors

- [ ] **Step 3: Start dev server and smoke test CLI**

Run: `bun run dev:server &`
Wait for startup, then:

```bash
# Test CLI help
bun bin/tinkaria-project --help

# Test sessions (should return empty array)
bun bin/tinkaria-project sessions --json

# Test tasks
bun bin/tinkaria-project tasks --json

# Test resources
bun bin/tinkaria-project resources --json
```

Expected: All commands return valid JSON without errors.

- [ ] **Step 4: Stop dev server**

Kill the background server process.

---

## Dependency Graph

```
Task 1 (Types)
  ↓
Task 2 (BM25) ─── Task 3 (SessionIndex) ─── Task 4 (TaskLedger) ─── Task 6 (ResourceRegistry)
  ↓                                                                      ↓
Task 5 (TranscriptSearch) ──────────────────────────────────────────────┐
                                                                        ↓
                                                                  Task 7 (ProjectAgent)
                                                                        ↓
                                                                  Task 8 (HTTP Routes)
                                                                        ↓
                                                                  Task 9 (CLI)
                                                                        ↓
                                                                  Task 10 (Integration)
                                                                        ↓
                                                                  Task 11 (Verification)
```

Tasks 2, 3, 4, 6 are independent and can be parallelized after Task 1 completes. Task 5 depends on Task 2. Tasks 7-11 are sequential.
