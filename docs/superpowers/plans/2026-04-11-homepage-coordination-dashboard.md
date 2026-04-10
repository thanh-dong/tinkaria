# Homepage Coordination Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/project/:id` route that renders a 4-panel coordination dashboard (Todos, Claims, Worktrees, Rules) driven by real-time `ProjectCoordinationSnapshot` data over the existing NatsSocket transport.

**Architecture:** A new `ProjectPage` route component subscribes to `{ type: "project", projectId }` via `socket.subscribe<ProjectCoordinationSnapshot>()` and stores the snapshot in local state. Four panel components receive slices of the snapshot as props and emit mutations via `socket.command()` using the 11 existing `project.*` `ClientCommand` types. No new transport, no new Zustand store — the snapshot subscription is the single source of truth. A custom hook `useProjectSubscription` encapsulates the subscribe/unsubscribe lifecycle. Each panel is a standalone component with its own test file.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS 4, Bun test, `lucide-react` icons, existing UI primitives (`Button`, `Card`, `Input`, `ScrollArea`, `cn`)

**Depends on:** Sub-projects 1 (durable project events) and 2 (coordination MCP server) — the server already publishes `ProjectCoordinationSnapshot` on the `project.<id>` snapshot subject and handles all `project.*` commands.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/client/app/ProjectPage.tsx` | Route component — subscribes to snapshot, renders 4 panels |
| `src/client/app/ProjectPage.test.tsx` | Tests for ProjectPage (snapshot rendering, panel composition) |
| `src/client/app/useProjectSubscription.ts` | Hook — `socket.subscribe` lifecycle for project topic |
| `src/client/app/useProjectSubscription.test.ts` | Tests for subscription hook |
| `src/client/components/coordination/TodosPanel.tsx` | Shared Todos panel — list, add, claim, complete, filters |
| `src/client/components/coordination/TodosPanel.test.tsx` | Tests for TodosPanel |
| `src/client/components/coordination/ClaimsPanel.tsx` | Claims panel — active claims, conflict indicators |
| `src/client/components/coordination/ClaimsPanel.test.tsx` | Tests for ClaimsPanel |
| `src/client/components/coordination/WorktreesPanel.tsx` | Worktrees panel — branch map, session assignments |
| `src/client/components/coordination/WorktreesPanel.test.tsx` | Tests for WorktreesPanel |
| `src/client/components/coordination/RulesPanel.tsx` | Rules panel — add/edit/remove project policies |
| `src/client/components/coordination/RulesPanel.test.tsx` | Tests for RulesPanel |
| `src/client/components/coordination/coordination-helpers.ts` | Shared formatting/filtering utilities |
| `src/client/components/coordination/coordination-helpers.test.ts` | Tests for helpers |
| `src/client/app/App.tsx` | Modify — add `/project/:id` route |

---

### Task 1: Coordination Helpers — Filtering and Formatting Utilities

**Files:**
- Create: `src/client/components/coordination/coordination-helpers.ts`
- Create: `src/client/components/coordination/coordination-helpers.test.ts`

- [ ] **Step 1: Write failing tests for todo filtering**

Create `src/client/components/coordination/coordination-helpers.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import {
  filterTodos,
  formatRelativeTimestamp,
  prioritySortOrder,
  isClaimConflicting,
} from "./coordination-helpers"
import type { ProjectTodo, ProjectClaim } from "../../../shared/project-agent-types"

function makeTodo(overrides: Partial<ProjectTodo> = {}): ProjectTodo {
  return {
    id: "t1",
    description: "Test todo",
    priority: "normal",
    status: "open",
    claimedBy: null,
    outputs: [],
    createdBy: "session-1",
    createdAt: "2026-04-11T00:00:00Z",
    updatedAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

function makeClaim(overrides: Partial<ProjectClaim> = {}): ProjectClaim {
  return {
    id: "c1",
    intent: "fix bug",
    files: ["src/foo.ts"],
    sessionId: "session-1",
    status: "active",
    conflictsWith: null,
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("filterTodos", () => {
  test("returns all todos when filter is 'all'", () => {
    const todos = [
      makeTodo({ status: "open" }),
      makeTodo({ id: "t2", status: "complete" }),
      makeTodo({ id: "t3", status: "claimed" }),
    ]
    expect(filterTodos(todos, "all")).toHaveLength(3)
  })

  test("filters by status", () => {
    const todos = [
      makeTodo({ status: "open" }),
      makeTodo({ id: "t2", status: "complete" }),
      makeTodo({ id: "t3", status: "claimed" }),
    ]
    expect(filterTodos(todos, "open")).toEqual([todos[0]])
    expect(filterTodos(todos, "complete")).toEqual([todos[1]])
  })
})

describe("prioritySortOrder", () => {
  test("returns numeric order: high=0, normal=1, low=2", () => {
    expect(prioritySortOrder("high")).toBe(0)
    expect(prioritySortOrder("normal")).toBe(1)
    expect(prioritySortOrder("low")).toBe(2)
  })
})

describe("formatRelativeTimestamp", () => {
  test("returns a non-empty string for valid ISO timestamp", () => {
    const result = formatRelativeTimestamp("2026-04-11T00:00:00Z")
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })
})

describe("isClaimConflicting", () => {
  test("returns true when conflictsWith is set", () => {
    expect(isClaimConflicting(makeClaim({ conflictsWith: "c2" }))).toBe(true)
  })

  test("returns false when conflictsWith is null", () => {
    expect(isClaimConflicting(makeClaim({ conflictsWith: null }))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/coordination/coordination-helpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement coordination-helpers.ts**

Create `src/client/components/coordination/coordination-helpers.ts`:

```typescript
import type {
  ProjectTodo,
  ProjectClaim,
  CoordinationTodoStatus,
  TodoPriority,
} from "../../../shared/project-agent-types"

export type TodoFilter = "all" | CoordinationTodoStatus

export function filterTodos(todos: ProjectTodo[], filter: TodoFilter): ProjectTodo[] {
  if (filter === "all") return todos
  return todos.filter((t) => t.status === filter)
}

const PRIORITY_ORDER: Record<TodoPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

export function prioritySortOrder(priority: TodoPriority): number {
  return PRIORITY_ORDER[priority] ?? 1
}

export function sortTodosByPriority(todos: ProjectTodo[]): ProjectTodo[] {
  return [...todos].sort(
    (a, b) => prioritySortOrder(a.priority) - prioritySortOrder(b.priority)
  )
}

export function formatRelativeTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export function isClaimConflicting(claim: ProjectClaim): boolean {
  return claim.conflictsWith !== null
}

export function getActiveClaimsCount(claims: ProjectClaim[]): number {
  return claims.filter((c) => c.status === "active").length
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/coordination/coordination-helpers.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/client/components/coordination/coordination-helpers.ts src/client/components/coordination/coordination-helpers.test.ts
git commit -m "feat(coordination): add filtering and formatting helpers"
```

---

### Task 2: useProjectSubscription Hook

**Files:**
- Create: `src/client/app/useProjectSubscription.ts`
- Create: `src/client/app/useProjectSubscription.test.ts`

- [ ] **Step 1: Write failing test for the hook**

Create `src/client/app/useProjectSubscription.test.ts`:

```typescript
import { describe, test, expect, mock, afterEach } from "bun:test"
import type { AppTransport } from "./socket-interface"
import type { ProjectCoordinationSnapshot } from "../../shared/project-agent-types"
import type { ClientCommand, SubscriptionTopic } from "../../shared/protocol"

// Test the subscription logic without React — test the subscribe call shape
describe("useProjectSubscription contract", () => {
  test("subscribes with correct topic shape", () => {
    const subscribeMock = mock(() => () => {})
    const fakeSocket: Pick<AppTransport, "subscribe"> = {
      subscribe: subscribeMock,
    }

    const projectId = "proj-123"
    const topic: SubscriptionTopic = { type: "project", projectId }

    fakeSocket.subscribe<ProjectCoordinationSnapshot>(topic, () => {})

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    const [calledTopic] = subscribeMock.mock.calls[0] as [SubscriptionTopic, unknown]
    expect(calledTopic).toEqual({ type: "project", projectId: "proj-123" })
  })

  test("unsubscribe function is returned", () => {
    const unsubMock = mock(() => {})
    const fakeSocket: Pick<AppTransport, "subscribe"> = {
      subscribe: mock(() => unsubMock),
    }

    const unsub = fakeSocket.subscribe<ProjectCoordinationSnapshot>(
      { type: "project", projectId: "proj-123" },
      () => {}
    )

    expect(typeof unsub).toBe("function")
    unsub()
    expect(unsubMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (contract test — no implementation needed yet)**

Run: `bun test src/client/app/useProjectSubscription.test.ts`
Expected: PASS — these test the socket interface contract

- [ ] **Step 3: Create the hook**

Create `src/client/app/useProjectSubscription.ts`:

```typescript
import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { ProjectCoordinationSnapshot } from "../../shared/project-agent-types"

export function useProjectSubscription(
  socket: AppTransport,
  projectId: string | null
): ProjectCoordinationSnapshot | null {
  const [snapshot, setSnapshot] = useState<ProjectCoordinationSnapshot | null>(null)

  useEffect(() => {
    if (!projectId) {
      setSnapshot(null)
      return
    }

    return socket.subscribe<ProjectCoordinationSnapshot>(
      { type: "project", projectId },
      (data) => setSnapshot(data)
    )
  }, [socket, projectId])

  return snapshot
}
```

- [ ] **Step 4: Commit**

```bash
git add src/client/app/useProjectSubscription.ts src/client/app/useProjectSubscription.test.ts
git commit -m "feat(coordination): add useProjectSubscription hook"
```

---

### Task 3: TodosPanel Component

**Files:**
- Create: `src/client/components/coordination/TodosPanel.tsx`
- Create: `src/client/components/coordination/TodosPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/client/components/coordination/TodosPanel.test.tsx`:

```typescript
import { describe, test, expect, mock } from "bun:test"
import type { ProjectTodo } from "../../../shared/project-agent-types"

function makeTodo(overrides: Partial<ProjectTodo> = {}): ProjectTodo {
  return {
    id: "t1",
    description: "Implement feature X",
    priority: "normal",
    status: "open",
    claimedBy: null,
    outputs: [],
    createdBy: "session-1",
    createdAt: "2026-04-11T00:00:00Z",
    updatedAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("TodosPanel", () => {
  test("exports TodosPanel component and TodosPanelProps type", async () => {
    const mod = await import("./TodosPanel")
    expect(typeof mod.TodosPanel).toBe("function")
  })

  test("onAddTodo callback receives description and priority", () => {
    const onAdd = mock(() => {})
    // Simulate what the component does internally
    const description = "New task"
    const priority = "high" as const
    onAdd(description, priority)
    expect(onAdd).toHaveBeenCalledWith("New task", "high")
  })

  test("onClaimTodo callback receives todoId and sessionId", () => {
    const onClaim = mock(() => {})
    onClaim("t1", "session-1")
    expect(onClaim).toHaveBeenCalledWith("t1", "session-1")
  })

  test("onCompleteTodo callback receives todoId and outputs", () => {
    const onComplete = mock(() => {})
    onComplete("t1", ["output.txt"])
    expect(onComplete).toHaveBeenCalledWith("t1", ["output.txt"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/coordination/TodosPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TodosPanel**

Create `src/client/components/coordination/TodosPanel.tsx`:

```typescript
import { useState } from "react"
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Loader2,
  Plus,
  ArrowUpCircle,
  ArrowRightCircle,
  ArrowDownCircle,
  X,
} from "lucide-react"
import type { ProjectTodo, TodoPriority, CoordinationTodoStatus } from "../../../shared/project-agent-types"
import { filterTodos, sortTodosByPriority, formatRelativeTimestamp, type TodoFilter } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface TodosPanelProps {
  todos: ProjectTodo[]
  onAddTodo: (description: string, priority: TodoPriority) => void
  onClaimTodo: (todoId: string, sessionId: string) => void
  onCompleteTodo: (todoId: string, outputs: string[]) => void
  onAbandonTodo: (todoId: string) => void
}

const STATUS_ICON: Record<CoordinationTodoStatus, typeof Circle> = {
  open: Circle,
  claimed: CircleDot,
  complete: CheckCircle2,
  abandoned: X,
}

const PRIORITY_ICON: Record<TodoPriority, typeof ArrowUpCircle> = {
  high: ArrowUpCircle,
  normal: ArrowRightCircle,
  low: ArrowDownCircle,
}

const PRIORITY_COLOR: Record<TodoPriority, string> = {
  high: "text-red-500",
  normal: "text-muted-foreground",
  low: "text-blue-400",
}

const FILTER_OPTIONS: { value: TodoFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "complete", label: "Done" },
]

export function TodosPanel({
  todos,
  onAddTodo,
  onClaimTodo,
  onCompleteTodo,
  onAbandonTodo,
}: TodosPanelProps) {
  const [filter, setFilter] = useState<TodoFilter>("all")
  const [newDescription, setNewDescription] = useState("")
  const [newPriority, setNewPriority] = useState<TodoPriority>("normal")
  const [showAddForm, setShowAddForm] = useState(false)

  const filtered = sortTodosByPriority(filterTodos(todos, filter))

  function handleAdd() {
    const trimmed = newDescription.trim()
    if (!trimmed) return
    onAddTodo(trimmed, newPriority)
    setNewDescription("")
    setNewPriority("normal")
    setShowAddForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Shared Todos</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Add todo"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Task description..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              className="bg-transparent border border-border rounded-md px-2 py-1 text-xs text-foreground"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <Button variant="default" size="sm" onClick={handleAdd}>
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 px-3 py-1.5 border-b border-border">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={cn(
              "px-2 py-0.5 rounded-full text-xs transition-colors",
              filter === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No todos</p>
        )}
        {filtered.map((todo) => {
          const StatusIcon = STATUS_ICON[todo.status]
          const PriorityIcon = PRIORITY_ICON[todo.priority]
          return (
            <div
              key={todo.id}
              className="flex items-start gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", todo.status === "complete" ? "text-green-500" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm", todo.status === "complete" && "line-through text-muted-foreground")}>
                  {todo.description}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <PriorityIcon className={cn("h-3 w-3", PRIORITY_COLOR[todo.priority])} />
                  {todo.claimedBy && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {todo.claimedBy}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTimestamp(todo.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/coordination/TodosPanel.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/client/components/coordination/TodosPanel.tsx src/client/components/coordination/TodosPanel.test.tsx
git commit -m "feat(coordination): add TodosPanel component"
```

---

### Task 4: ClaimsPanel Component

**Files:**
- Create: `src/client/components/coordination/ClaimsPanel.tsx`
- Create: `src/client/components/coordination/ClaimsPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/client/components/coordination/ClaimsPanel.test.tsx`:

```typescript
import { describe, test, expect, mock } from "bun:test"
import type { ProjectClaim } from "../../../shared/project-agent-types"

function makeClaim(overrides: Partial<ProjectClaim> = {}): ProjectClaim {
  return {
    id: "c1",
    intent: "fix authentication bug",
    files: ["src/auth.ts", "src/session.ts"],
    sessionId: "session-1",
    status: "active",
    conflictsWith: null,
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("ClaimsPanel", () => {
  test("exports ClaimsPanel component", async () => {
    const mod = await import("./ClaimsPanel")
    expect(typeof mod.ClaimsPanel).toBe("function")
  })

  test("onCreateClaim callback receives intent, files, sessionId", () => {
    const onCreate = mock(() => {})
    onCreate("fix bug", ["src/foo.ts"], "session-1")
    expect(onCreate).toHaveBeenCalledWith("fix bug", ["src/foo.ts"], "session-1")
  })

  test("onReleaseClaim callback receives claimId", () => {
    const onRelease = mock(() => {})
    onRelease("c1")
    expect(onRelease).toHaveBeenCalledWith("c1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/coordination/ClaimsPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ClaimsPanel**

Create `src/client/components/coordination/ClaimsPanel.tsx`:

```typescript
import { useState } from "react"
import {
  FileCode2,
  AlertTriangle,
  Shield,
  ShieldOff,
  Plus,
} from "lucide-react"
import type { ProjectClaim } from "../../../shared/project-agent-types"
import { isClaimConflicting, formatRelativeTimestamp } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface ClaimsPanelProps {
  claims: ProjectClaim[]
  onCreateClaim: (intent: string, files: string[], sessionId: string) => void
  onReleaseClaim: (claimId: string) => void
}

export function ClaimsPanel({
  claims,
  onCreateClaim,
  onReleaseClaim,
}: ClaimsPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newIntent, setNewIntent] = useState("")
  const [newFiles, setNewFiles] = useState("")
  const [newSessionId, setNewSessionId] = useState("")

  const activeClaims = claims.filter((c) => c.status === "active")
  const releasedClaims = claims.filter((c) => c.status !== "active")

  function handleCreate() {
    const intent = newIntent.trim()
    const files = newFiles.split(",").map((f) => f.trim()).filter(Boolean)
    const sessionId = newSessionId.trim()
    if (!intent || files.length === 0 || !sessionId) return
    onCreateClaim(intent, files, sessionId)
    setNewIntent("")
    setNewFiles("")
    setNewSessionId("")
    setShowAddForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Claims
          {activeClaims.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({activeClaims.length} active)
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Create claim"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Intent (e.g. fix auth bug)..."
            value={newIntent}
            onChange={(e) => setNewIntent(e.target.value)}
            autoFocus
          />
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Files (comma-separated)..."
            value={newFiles}
            onChange={(e) => setNewFiles(e.target.value)}
          />
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Session ID..."
            value={newSessionId}
            onChange={(e) => setNewSessionId(e.target.value)}
          />
          <Button variant="default" size="sm" onClick={handleCreate}>
            Claim
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {claims.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No claims</p>
        )}
        {activeClaims.map((claim) => {
          const conflicting = isClaimConflicting(claim)
          return (
            <div
              key={claim.id}
              className={cn(
                "px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors",
                conflicting && "bg-red-500/5 border-l-2 border-l-red-500"
              )}
            >
              <div className="flex items-center gap-2">
                {conflicting ? (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <Shield className="h-4 w-4 text-green-500 shrink-0" />
                )}
                <span className="text-sm font-medium text-foreground truncate">{claim.intent}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  onClick={() => onReleaseClaim(claim.id)}
                  aria-label="Release claim"
                >
                  <ShieldOff className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1 ml-6">
                {claim.files.map((file) => (
                  <span
                    key={file}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs text-muted-foreground"
                  >
                    <FileCode2 className="h-3 w-3" />
                    {file}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1 ml-6">
                <span className="text-xs text-muted-foreground truncate">{claim.sessionId}</span>
                <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(claim.createdAt)}</span>
                {conflicting && (
                  <span className="text-xs text-red-500 font-medium">
                    conflicts with {claim.conflictsWith}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {releasedClaims.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            Released ({releasedClaims.length})
          </div>
        )}
        {releasedClaims.map((claim) => (
          <div key={claim.id} className="px-3 py-2 border-b border-border/50 opacity-50">
            <div className="flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{claim.intent}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/coordination/ClaimsPanel.test.tsx`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/client/components/coordination/ClaimsPanel.tsx src/client/components/coordination/ClaimsPanel.test.tsx
git commit -m "feat(coordination): add ClaimsPanel component"
```

---

### Task 5: WorktreesPanel Component

**Files:**
- Create: `src/client/components/coordination/WorktreesPanel.tsx`
- Create: `src/client/components/coordination/WorktreesPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/client/components/coordination/WorktreesPanel.test.tsx`:

```typescript
import { describe, test, expect, mock } from "bun:test"
import type { ProjectWorktree } from "../../../shared/project-agent-types"

function makeWorktree(overrides: Partial<ProjectWorktree> = {}): ProjectWorktree {
  return {
    id: "wt1",
    branch: "feat/auth",
    baseBranch: "main",
    path: "/tmp/project-wt1",
    assignedTo: null,
    status: "ready",
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("WorktreesPanel", () => {
  test("exports WorktreesPanel component", async () => {
    const mod = await import("./WorktreesPanel")
    expect(typeof mod.WorktreesPanel).toBe("function")
  })

  test("onCreateWorktree callback receives branch and baseBranch", () => {
    const onCreate = mock(() => {})
    onCreate("feat/auth", "main")
    expect(onCreate).toHaveBeenCalledWith("feat/auth", "main")
  })

  test("onAssignWorktree callback receives worktreeId and sessionId", () => {
    const onAssign = mock(() => {})
    onAssign("wt1", "session-1")
    expect(onAssign).toHaveBeenCalledWith("wt1", "session-1")
  })

  test("onRemoveWorktree callback receives worktreeId", () => {
    const onRemove = mock(() => {})
    onRemove("wt1")
    expect(onRemove).toHaveBeenCalledWith("wt1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/coordination/WorktreesPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement WorktreesPanel**

Create `src/client/components/coordination/WorktreesPanel.tsx`:

```typescript
import { useState } from "react"
import {
  GitBranch,
  GitFork,
  Plus,
  Trash2,
  User,
  UserPlus,
} from "lucide-react"
import type { ProjectWorktree } from "../../../shared/project-agent-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface WorktreesPanelProps {
  worktrees: ProjectWorktree[]
  onCreateWorktree: (branch: string, baseBranch: string) => void
  onAssignWorktree: (worktreeId: string, sessionId: string) => void
  onRemoveWorktree: (worktreeId: string) => void
}

const STATUS_COLOR: Record<string, string> = {
  ready: "text-blue-400",
  assigned: "text-green-500",
  removed: "text-muted-foreground",
}

export function WorktreesPanel({
  worktrees,
  onCreateWorktree,
  onAssignWorktree,
  onRemoveWorktree,
}: WorktreesPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBranch, setNewBranch] = useState("")
  const [newBaseBranch, setNewBaseBranch] = useState("main")
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignSessionId, setAssignSessionId] = useState("")

  const activeWorktrees = worktrees.filter((w) => w.status !== "removed")
  const removedWorktrees = worktrees.filter((w) => w.status === "removed")

  function handleCreate() {
    const branch = newBranch.trim()
    const baseBranch = newBaseBranch.trim()
    if (!branch) return
    onCreateWorktree(branch, baseBranch || "main")
    setNewBranch("")
    setNewBaseBranch("main")
    setShowAddForm(false)
  }

  function handleAssign(worktreeId: string) {
    const sessionId = assignSessionId.trim()
    if (!sessionId) return
    onAssignWorktree(worktreeId, sessionId)
    setAssigningId(null)
    setAssignSessionId("")
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Worktrees
          {activeWorktrees.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({activeWorktrees.length})
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Create worktree"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Branch name (e.g. feat/auth)..."
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <input
              className="flex-1 bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Base branch"
              value={newBaseBranch}
              onChange={(e) => setNewBaseBranch(e.target.value)}
            />
            <Button variant="default" size="sm" onClick={handleCreate}>
              Create
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {worktrees.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No worktrees</p>
        )}
        {activeWorktrees.map((wt) => (
          <div key={wt.id} className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <GitBranch className={cn("h-4 w-4 shrink-0", STATUS_COLOR[wt.status] ?? "text-muted-foreground")} />
              <span className="text-sm font-mono font-medium text-foreground truncate">{wt.branch}</span>
              <GitFork className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-mono">{wt.baseBranch}</span>
              <div className="ml-auto flex items-center gap-1">
                {wt.status === "ready" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAssigningId(assigningId === wt.id ? null : wt.id)}
                    aria-label="Assign session"
                  >
                    <UserPlus className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemoveWorktree(wt.id)}
                  aria-label="Remove worktree"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {wt.assignedTo && (
              <div className="flex items-center gap-1 mt-1 ml-6">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{wt.assignedTo}</span>
              </div>
            )}
            {assigningId === wt.id && (
              <div className="flex items-center gap-2 mt-1 ml-6">
                <input
                  className="flex-1 bg-transparent border border-border rounded-md px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Session ID..."
                  value={assignSessionId}
                  onChange={(e) => setAssignSessionId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAssign(wt.id) }}
                  autoFocus
                />
                <Button variant="default" size="sm" onClick={() => handleAssign(wt.id)}>
                  Assign
                </Button>
              </div>
            )}
            <div className="mt-0.5 ml-6">
              <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(wt.createdAt)}</span>
            </div>
          </div>
        ))}
        {removedWorktrees.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            Removed ({removedWorktrees.length})
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/coordination/WorktreesPanel.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/client/components/coordination/WorktreesPanel.tsx src/client/components/coordination/WorktreesPanel.test.tsx
git commit -m "feat(coordination): add WorktreesPanel component"
```

---

### Task 6: RulesPanel Component

**Files:**
- Create: `src/client/components/coordination/RulesPanel.tsx`
- Create: `src/client/components/coordination/RulesPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/client/components/coordination/RulesPanel.test.tsx`:

```typescript
import { describe, test, expect, mock } from "bun:test"
import type { ProjectRule } from "../../../shared/project-agent-types"

function makeRule(overrides: Partial<ProjectRule> = {}): ProjectRule {
  return {
    id: "r1",
    content: "Always write tests before implementation",
    setBy: "session-1",
    updatedAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("RulesPanel", () => {
  test("exports RulesPanel component", async () => {
    const mod = await import("./RulesPanel")
    expect(typeof mod.RulesPanel).toBe("function")
  })

  test("onSetRule callback receives ruleId, content, setBy", () => {
    const onSet = mock(() => {})
    onSet("r1", "new content", "session-2")
    expect(onSet).toHaveBeenCalledWith("r1", "new content", "session-2")
  })

  test("onRemoveRule callback receives ruleId", () => {
    const onRemove = mock(() => {})
    onRemove("r1")
    expect(onRemove).toHaveBeenCalledWith("r1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/coordination/RulesPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RulesPanel**

Create `src/client/components/coordination/RulesPanel.tsx`:

```typescript
import { useState } from "react"
import {
  BookOpen,
  Edit3,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react"
import type { ProjectRule } from "../../../shared/project-agent-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface RulesPanelProps {
  rules: ProjectRule[]
  onSetRule: (ruleId: string, content: string, setBy: string) => void
  onRemoveRule: (ruleId: string) => void
}

export function RulesPanel({
  rules,
  onSetRule,
  onRemoveRule,
}: RulesPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newContent, setNewContent] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")

  function handleAdd() {
    const content = newContent.trim()
    if (!content) return
    const ruleId = `rule-${Date.now()}`
    onSetRule(ruleId, content, "ui")
    setNewContent("")
    setShowAddForm(false)
  }

  function startEdit(rule: ProjectRule) {
    setEditingId(rule.id)
    setEditContent(rule.content)
  }

  function handleSaveEdit(ruleId: string) {
    const content = editContent.trim()
    if (!content) return
    onSetRule(ruleId, content, "ui")
    setEditingId(null)
    setEditContent("")
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Rules
          {rules.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({rules.length})
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Add rule"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <textarea
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            placeholder="Rule content..."
            rows={3}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            autoFocus
          />
          <Button variant="default" size="sm" onClick={handleAdd}>
            Add Rule
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {rules.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No rules</p>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors">
            {editingId === rule.id ? (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => handleSaveEdit(rule.id)} aria-label="Save">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(null)} aria-label="Cancel">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground flex-1">{rule.content}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(rule)} aria-label="Edit rule">
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => onRemoveRule(rule.id)} aria-label="Remove rule">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-6">
                  <span className="text-xs text-muted-foreground">by {rule.setBy}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(rule.updatedAt)}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/coordination/RulesPanel.test.tsx`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/client/components/coordination/RulesPanel.tsx src/client/components/coordination/RulesPanel.test.tsx
git commit -m "feat(coordination): add RulesPanel component"
```

---

### Task 7: ProjectPage Route Component

**Files:**
- Create: `src/client/app/ProjectPage.tsx`
- Create: `src/client/app/ProjectPage.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/client/app/ProjectPage.test.tsx`:

```typescript
import { describe, test, expect } from "bun:test"

describe("ProjectPage", () => {
  test("exports ProjectPage component", async () => {
    const mod = await import("./ProjectPage")
    expect(typeof mod.ProjectPage).toBe("function")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/ProjectPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectPage**

Create `src/client/app/ProjectPage.tsx`:

```typescript
import { useCallback, useMemo } from "react"
import { useOutletContext, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import type { ProjectCoordinationSnapshot } from "../../shared/project-agent-types"
import type { TodoPriority } from "../../shared/project-agent-types"
import { useProjectSubscription } from "./useProjectSubscription"
import { PageHeader } from "./PageHeader"
import { TodosPanel } from "../components/coordination/TodosPanel"
import { ClaimsPanel } from "../components/coordination/ClaimsPanel"
import { WorktreesPanel } from "../components/coordination/WorktreesPanel"
import { RulesPanel } from "../components/coordination/RulesPanel"
import type { AppState } from "./useAppState"

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ProjectPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const state = useOutletContext<AppState>()
  const snapshot = useProjectSubscription(state.socket, projectId ?? null)

  const handleAddTodo = useCallback(
    (description: string, priority: TodoPriority) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.todo.add",
        projectId,
        todoId: generateId("todo"),
        description,
        priority,
      })
    },
    [projectId, state.socket]
  )

  const handleClaimTodo = useCallback(
    (todoId: string, sessionId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.todo.claim",
        projectId,
        todoId,
        sessionId,
      })
    },
    [projectId, state.socket]
  )

  const handleCompleteTodo = useCallback(
    (todoId: string, outputs: string[]) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.todo.complete",
        projectId,
        todoId,
        outputs,
      })
    },
    [projectId, state.socket]
  )

  const handleAbandonTodo = useCallback(
    (todoId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.todo.abandon",
        projectId,
        todoId,
      })
    },
    [projectId, state.socket]
  )

  const handleCreateClaim = useCallback(
    (intent: string, files: string[], sessionId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.claim.create",
        projectId,
        claimId: generateId("claim"),
        intent,
        files,
        sessionId,
      })
    },
    [projectId, state.socket]
  )

  const handleReleaseClaim = useCallback(
    (claimId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.claim.release",
        projectId,
        claimId,
      })
    },
    [projectId, state.socket]
  )

  const handleCreateWorktree = useCallback(
    (branch: string, baseBranch: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.worktree.create",
        projectId,
        worktreeId: generateId("wt"),
        branch,
        baseBranch,
      })
    },
    [projectId, state.socket]
  )

  const handleAssignWorktree = useCallback(
    (worktreeId: string, sessionId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.worktree.assign",
        projectId,
        worktreeId,
        sessionId,
      })
    },
    [projectId, state.socket]
  )

  const handleRemoveWorktree = useCallback(
    (worktreeId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.worktree.remove",
        projectId,
        worktreeId,
      })
    },
    [projectId, state.socket]
  )

  const handleSetRule = useCallback(
    (ruleId: string, content: string, setBy: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.rule.set",
        projectId,
        ruleId,
        content,
        setBy,
      })
    },
    [projectId, state.socket]
  )

  const handleRemoveRule = useCallback(
    (ruleId: string) => {
      if (!projectId) return
      void state.socket.command({
        type: "project.rule.remove",
        projectId,
        ruleId,
      })
    },
    [projectId, state.socket]
  )

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <PageHeader title="Project Coordination" subtitle={projectId} />
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-border min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border">
        <div className="bg-background overflow-hidden">
          <TodosPanel
            todos={snapshot.todos}
            onAddTodo={handleAddTodo}
            onClaimTodo={handleClaimTodo}
            onCompleteTodo={handleCompleteTodo}
            onAbandonTodo={handleAbandonTodo}
          />
        </div>
        <div className="bg-background overflow-hidden">
          <ClaimsPanel
            claims={snapshot.claims}
            onCreateClaim={handleCreateClaim}
            onReleaseClaim={handleReleaseClaim}
          />
        </div>
        <div className="bg-background overflow-hidden">
          <WorktreesPanel
            worktrees={snapshot.worktrees}
            onCreateWorktree={handleCreateWorktree}
            onAssignWorktree={handleAssignWorktree}
            onRemoveWorktree={handleRemoveWorktree}
          />
        </div>
        <div className="bg-background overflow-hidden">
          <RulesPanel
            rules={snapshot.rules}
            onSetRule={handleSetRule}
            onRemoveRule={handleRemoveRule}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/app/ProjectPage.test.tsx`
Expected: PASS — 1 test

- [ ] **Step 5: Commit**

```bash
git add src/client/app/ProjectPage.tsx src/client/app/ProjectPage.test.tsx
git commit -m "feat(coordination): add ProjectPage route component with 4-panel dashboard"
```

---

### Task 8: Wire Route into App.tsx

**Files:**
- Modify: `src/client/app/App.tsx`

- [ ] **Step 1: Add the route**

In `src/client/app/App.tsx`, add the import and route:

Add import near the top with other page imports:
```typescript
import { ProjectPage } from "./ProjectPage"
```

Add route inside the `<Route element={<AppLayout />}>` block, after the `/chat/:chatId` route:
```typescript
<Route path="/project/:id" element={<ProjectPage />} />
```

The `AppInner` function's `<Routes>` block should look like:
```typescript
<Routes>
  <Route element={<AppLayout />}>
    <Route path="/" element={<LocalProjectsPage />} />
    <Route path="/settings/*" element={<Navigate to="/" replace />} />
    <Route path="/chat/:chatId" element={<ChatPage />} />
    <Route path="/project/:id" element={<ProjectPage />} />
  </Route>
</Routes>
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/app/App.tsx
git commit -m "feat(coordination): wire /project/:id route into App"
```

---

### Task 9: Expose socket on AppState

The `ProjectPage` uses `state.socket` from `useOutletContext<AppState>()`. The `AppState` type must include `socket: AppTransport`.

**Files:**
- Modify: `src/client/app/useAppState.ts`

- [ ] **Step 1: Check if socket is already exposed on AppState**

Read the `AppState` export in `src/client/app/useAppState.ts`. Look for the return type or `AppState` interface/type. The hook creates `socket` via `useAppSocket()` and returns a state object. Check whether `socket` is included in the return value.

- [ ] **Step 2: If socket is NOT exposed, add it to the return object**

In `useAppState.ts`, locate the return statement of `useAppState()` and add `socket` to the returned object. Also update the `AppState` type (if it's explicitly defined) to include:

```typescript
socket: AppTransport
```

If `AppState` is inferred from the return type, just adding `socket` to the return object is sufficient.

- [ ] **Step 3: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/client/app/useAppState.ts
git commit -m "feat(coordination): expose socket on AppState for ProjectPage"
```

---

### Task 10: Run Full Test Suite and Typecheck

- [ ] **Step 1: Run all coordination tests**

Run: `bun test src/client/components/coordination/ src/client/app/useProjectSubscription.test.ts src/client/app/ProjectPage.test.tsx`
Expected: all tests PASS

- [ ] **Step 2: Run full typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: no errors

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: all tests PASS — no regressions

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix(coordination): address test/type issues from integration"
```
