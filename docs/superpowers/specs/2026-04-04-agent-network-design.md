# Tinkaria Agent Network

**Date:** 2026-04-04
**Status:** Draft

## Problem

Tinkaria sessions are isolated silos. The existing `SessionOrchestrator` lets a parent session spawn children within the same project, but:
- No session can see what another session is doing
- No persistent agent identity or task ownership
- No shared resource coordination (DB, services, processes)
- No cross-session search over what was already implemented

When multiple sessions work on the same project (especially the same branch), they duplicate work, step on each other's resources, and have no way to coordinate.

## Core Concept

Every project gets a **stateless Project Agent** that provides:
- **Knowledge**: what every session is doing, searchable history of what was done
- **Coordination**: who owns what task, shared resource management
- **Delegation**: requests routed to a cheap model turn for reasoning decisions

The Project Agent is a **function, not a session** — it reads from always-ready data sources, optionally runs a cheap Haiku turn for delegation reasoning, and returns a result. No persistent context. No accumulated state.

Sessions interact with it via a **CLI** (`tinkaria project <cmd>`), callable from any agent's Bash tool. The `--help` text is self-documenting. No MCP tool descriptions in the prompt. JSON-native output for machine consumers.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent autonomy | Steered (invoked) | No daemon complexity. Agents run when asked. |
| Awareness mechanism | Pull-based query tools | Sessions query when they need context. No injection overhead at spawn. |
| Project agent lifecycle | Auto-created when project opens | Always available. No manual setup. |
| Query depth | Summaries + lexical search | Cheap, no embedding infrastructure. BM25 over text + metadata. |
| Interface | CLI (`tinkaria project`) | Zero context cost. Self-documenting via `--help`. JSON-native. |
| Statefulness | Stateless function | Data sources hold the state. Each call is fresh. Optional Haiku turn for reasoning. |
| Delegation intelligence | Smart coordinator | Makes decisions: queue, sequence, block, inform. Not just a passthrough. |
| Model | Configurable per project | Default: haiku. Cheap and fast for coordination. |
| Resource coordination | Leases with TTL | Not plain locks. Leases expire on crash. Fencing tokens prevent stale writes. |

## Components

### 1. SessionIndex (read model)

Projection from event store. Same pattern as existing `SidebarData` / `ChatSnapshot` in `c3-214`.

```typescript
interface SessionRecord {
  chatId: string
  intent: string           // derived from first user message
  status: "active" | "idle" | "complete" | "failed"
  provider: AgentProvider
  branch: string | null    // git branch if detectable
  filesTouched: string[]   // accumulated from tool calls
  commandsRun: string[]    // accumulated from Bash calls
  lastActivity: string     // ISO timestamp
}
```

- Updated on every transcript append event
- Scoped per project
- `intent` derived from the first user message in the session
- `filesTouched` / `commandsRun` accumulated from tool call events

### 2. TaskLedger (coordination state)

The middle layer between summaries and raw transcripts. Answers "who owns what?" without transcript archaeology.

```typescript
interface TaskEntry {
  id: string
  description: string      // what the task is
  ownedBy: string          // chatId of the session that claimed it
  status: "claimed" | "in_progress" | "complete" | "abandoned"
  branch: string | null    // branch the work is on
  outputs: string[]        // files produced, PRs created, etc.
  claimedAt: string        // ISO timestamp
  updatedAt: string        // ISO timestamp
}
```

- Sessions explicitly claim tasks via `tinkaria project claim "implement auth middleware"`
- Sessions release/complete tasks via `tinkaria project complete <task-id>`
- Abandoned detection: if a session goes idle for N minutes with a claimed task, mark abandoned
- The delegation function queries this to answer "who is working on X?"

### 3. TranscriptSearchIndex (lexical search)

BM25 index over transcript entries. Each document is one transcript entry, enriched with metadata.

```typescript
interface SearchDocument {
  chatId: string
  timestamp: string
  kind: "user" | "assistant" | "tool_call" | "tool_result"
  text: string             // the transcript text
  // metadata fields (also indexed)
  filePaths: string[]      // files referenced in the entry
  toolNames: string[]      // tools used
  errorNames: string[]     // error types encountered
}
```

- Rebuilt on startup from event store
- Incrementally updated on new transcript entries
- Query returns ranked fragments with session attribution
- Lexical search — works when transcripts contain the actual terms

### 4. ResourceRegistry (coordination state)

Manages shared resources with lease-based coordination.

```typescript
interface ResourceLease {
  resource: string         // "postgres", "redis", "migration-lock"
  type: "exclusive" | "shared"
  heldBy: string           // chatId
  fencingToken: number     // monotonic, prevents stale writes
  expiresAt: string        // ISO timestamp (TTL-based)
  metadata: Record<string, string>  // connection strings, ports, etc.
}

interface ResourceState {
  name: string
  kind: "database" | "cache" | "service" | "process"
  status: "running" | "stopped" | "starting"
  managedBy: "zerobased" | "docker" | "manual"
  connectionString: string | null
  leases: ResourceLease[]
}
```

Coordination primitives:
- **Exclusive lease**: one holder at a time (e.g., migration lock). Expires on TTL.
- **Shared lease**: multiple holders (e.g., "postgres is in use"). Prevents shutdown while held.
- **Singleflight**: "ensure postgres is running" — if already starting, wait for the in-flight operation instead of starting a second one.
- **Fencing token**: monotonically increasing. An expired holder's writes are rejected if the token is stale.

### 5. Project Agent Function (stateless)

Not a session. A function that:
1. Receives a delegation request
2. Gathers relevant data from SessionIndex, TaskLedger, TranscriptSearchIndex, ResourceRegistry
3. If the answer is deterministic (resource already running, task already claimed): returns immediately, no LLM
4. If reasoning is needed (conflict resolution, coordination decision): runs a single Haiku turn with the gathered context
5. Returns the result

```typescript
async function handleDelegation(
  request: string,
  sources: { sessions: SessionIndex; tasks: TaskLedger; search: TranscriptSearchIndex; resources: ResourceRegistry },
  config: { model: string }  // configurable, default "haiku"
): Promise<DelegationResult>
```

The function is cheap because:
- Most queries are pure data lookups (no LLM)
- Delegation reasoning is a single turn with minimal context (just the gathered facts)
- Model is configurable and defaults to the cheapest option

### 6. `tinkaria project` CLI

JSON-native command-line interface. Agents call via Bash. Humans can use it too.

```
tinkaria project --help

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
  --json                      Output as JSON (default for machine consumers)
  --project <id>              Target project (default: current)
  --session <chat-id>         Identify calling session (for claim/complete)
  --version                   CLI version
```

Design constraints:
- `--json` output by default when stdout is not a TTY (machine consumer detection)
- Structured stderr for errors (JSON with `error`, `code`, `detail` fields)
- Explicit exit codes: 0 success, 1 client error, 2 server error, 3 conflict
- Versioned command surface (breaking changes = major version bump)
- Internal transport: HTTP to Tinkaria server `/api/project/*` endpoints

## Data Flow

```
Existing:
  User message → AgentCoordinator → Claude/Codex turn → transcript entries → EventStore

New projections (same pattern as SidebarData):
  EventStore.onAppend → SessionIndex.update()
  EventStore.onAppend → TranscriptSearchIndex.index()
  EventStore.onAppend → TaskLedger.detectAbandoned()

Query flow (no LLM):
  Agent Bash → `tinkaria project sessions` → CLI → HTTP → SessionIndex → JSON response

Search flow (no LLM):
  Agent Bash → `tinkaria project search "auth"` → CLI → HTTP → TranscriptSearchIndex → ranked fragments

Delegation flow (optional LLM):
  Agent Bash → `tinkaria project delegate "ensure DB running"` → CLI → HTTP
    → Project Agent Function gathers from all sources
    → Deterministic? Return immediately
    → Needs reasoning? Single Haiku turn → return result
```

## Security Model

- **Same-project boundary**: sessions within the same project can see each other's summaries and search results. This is the trust boundary.
- **Summary-level by default**: `search` returns fragments, not full transcripts. Raw transcript access requires explicit `--raw` flag.
- **Retrieved content is evidence, not instructions**: the system prompt for any LLM turn that consumes search results must frame them as "context from other sessions" — never as executable instructions. This mitigates prompt injection via transcript content.
- **Audit trail**: all cross-session queries are logged in the event store.

## Scenarios

### Two sessions avoiding duplicate work
```
Session A (auth):  tinkaria project sessions
  → [{ chatId: "b", intent: "implementing API routes", branch: "feat/api", status: "active" }]

Session B (API):   tinkaria project search "users table"
  → [{ chatId: "a", fragment: "Created users table with email, password_hash...", score: 0.87 }]
  → Session B knows the schema, doesn't redesign it
```

### Shared resource coordination
```
Session A:  tinkaria project delegate "start postgres for tests"
  → ResourceRegistry: not running → starts via zerobased → registers lease
  → { status: "started", connectionString: "postgres://...", leaseId: "..." }

Session B:  tinkaria project delegate "start postgres"
  → ResourceRegistry: already running, shared lease granted
  → { status: "already_running", connectionString: "postgres://..." }
```

### Conflict prevention with leases
```
Session A:  tinkaria project delegate "run migration 003_add_roles"
  → Acquires exclusive lease on "migrations" → runs migration
  → { status: "acquired", fencingToken: 7 }

Session B:  tinkaria project delegate "run migrations"
  → Lease check: exclusive lease held by Session A, expires in 4m
  → { status: "blocked", heldBy: "session-a", reason: "migration 003_add_roles in progress", expiresIn: "4m" }
```

### Task ownership
```
Session A:  tinkaria project claim "implement auth middleware"
  → { taskId: "t-1", status: "claimed" }

Session B:  tinkaria project tasks
  → [{ id: "t-1", description: "implement auth middleware", ownedBy: "session-a", status: "in_progress" }]
  → Session B knows to skip auth middleware

Session A:  tinkaria project complete t-1
  → { taskId: "t-1", status: "complete" }
```

## What This Does NOT Cover (Future)

- **Machine-level agents**: env prep, docker management, zerobased orchestration. Same pattern but different scope (machine vs. project).
- **Multi-machine networking**: Tinkaria instances on different machines querying each other. The HTTP API surface enables this but the spec doesn't define the protocol.
- **Embedding-based search**: BM25 is v1. Hybrid retrieval (BM25 + embeddings + rank fusion) is a natural upgrade.
- **MCP shim**: the CLI is the primary interface. An MCP adapter can be added later if needed.
- **Persistent workflows**: "watch this branch until CI passes." Requires a job state machine, not a stateful agent.

## Relationship to Existing Architecture

| Existing Component | Relationship |
|--------------------|-------------|
| `c3-201` EventStore | Source of truth. New projections read from it. |
| `c3-214` ReadModels | SessionIndex follows the same projection pattern. |
| `c3-205` NATS Transport | CLI → HTTP → server. NATS used internally for real-time updates to indexes. |
| `c3-210` AgentCoordinator | Unchanged. Runs turns as before. Project Agent Function calls it for Haiku turns. |
| `c3-217` SessionDiscovery | SessionIndex supersedes parts of session discovery for cross-session awareness. |
| `orchestration.ts` SessionOrchestrator | Unchanged. spawn_agent/wait_agent still work. CLI is additive. |
