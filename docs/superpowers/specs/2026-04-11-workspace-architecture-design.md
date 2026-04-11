# Workspace Architecture Design

**Date:** 2026-04-11
**Status:** Draft
**Approach:** Structured rename plus repo child model (Project → Workspace, add Repo)

## Overview

Replace the "project" concept with "workspace" as the top-level organizational unit. A workspace manages multiple repos, owns coordination state (todos, claims, worktrees, rules), agent configurations, and workflows. Chats and sessions stay repo-scoped by default. Workspace-level chats are exceptional admin/support flows, not the default working model. The product remains browser/PWA-first even as workspace execution grows more capable over time.

## Jobs to be Done

| # | Job | When... I want... |
|---|-----|-------------------|
| 1 | Set up a workspace | Starting a multi-repo initiative → single place for everything |
| 2 | Bring repos in | Have existing repos or remote URLs → workspace manages clone/track/remove |
| 3 | Work in context | Open a chat → scoped to a repo, aware of the whole workspace |
| 4 | Coordinate across sessions | Multiple agents in parallel → shared todos and claims prevent collisions |
| 5 | Run workflows against repos | Need sync/push/test/deploy → workflows target repos via MCP tools |
| 6 | Evolve the workspace | Needs change → reshape repos, settings, agent configs without losing history |
| 7 | Configure agents | Want agents to follow patterns → versioned configs in workspace git dir |
| 8 | Isolate execution | Workflows and agents run → sandboxed container per workspace |

## Scope Rules

- **Default chat scope = repo.** Most chats target exactly one repo.
- **Workspace-level chats are exceptional.** Reserve them for workspace-admin/support flows such as shared LLM/support settings, not day-to-day coding.
- **Session discovery/resume is repo-scoped for Phase 1.** Workspace read models may aggregate repo data, but session ownership stays attached to a repo.
- **Repo removal archives the repo and its chats together.** Removed repos do not get reassigned into workspace-level chats.
- **Browser/PWA-first remains the product constraint.** Sandbox/runtime work must support the frontend instead of redefining the product around a local-native or container-first shell.

## Domain Model

### Entities

```typescript
interface WorkspaceRecord {
  id: string
  title: string
  configPath: string          // ~/.tinkaria/workspaces/<id>/
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

interface RepoRecord {
  id: string
  workspaceId: string
  origin: string | null       // git remote URL or null for local-only
  localPath: string           // where it lives on disk
  label: string | null        // "backend", "design", "infra"
  status: "cloned" | "pending" | "error"
  branch: string | null
  createdAt: number
  updatedAt: number
}

interface ChatRecord {
  id: string
  workspaceId: string         // replaces projectId
  repoId: string | null       // null only for exceptional workspace-admin/support chats
  title: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
  unread: boolean
  provider: AgentProvider | null
  model?: string | null
  planMode: boolean
  sessionToken: string | null
  lastMessageAt?: number
  lastTurnOutcome: "success" | "failed" | "cancelled" | null
}

interface CoordinationState {
  todos: Map<string, WorkspaceTodo>
  claims: Map<string, WorkspaceClaim>
  worktrees: Map<string, WorkspaceWorktree>
  rules: Map<string, WorkspaceRule>
  lastUpdated: string
}
```

### EventStore State

```typescript
interface StoreState {
  workspacesById: Map<string, WorkspaceRecord>
  reposById: Map<string, RepoRecord>
  reposByPath: Map<string, string>                    // localPath → repoId
  chatsById: Map<string, ChatRecord>
  coordinationByWorkspace: Map<string, CoordinationState>
}
```

Phase 1 should assume repo-scoped chats and sessions. `repoId: null` is reserved for future workspace-admin/support flows and should not drive the initial implementation plan.

### Entity Relationships

- `WorkspaceRecord` 1 → N `RepoRecord` (via workspaceId)
- `WorkspaceRecord` 1 → N `ChatRecord` (via workspaceId)
- `RepoRecord` 1 → N `ChatRecord` (via repoId)
- `WorkspaceRecord` 1 → 1 `CoordinationState` (via coordinationByWorkspace key)

## Event Types

### Workspace Lifecycle

```
workspace_created    { id, title, configPath }
workspace_updated    { id, title?, settings? }
workspace_deleted    { id }
```

### Repo Management

```
repo_added           { id, workspaceId, localPath, origin?, label? }
repo_clone_started   { id, workspaceId, origin, targetPath }
repo_cloned          { id, localPath }
repo_clone_failed    { id, error }
repo_removed         { id, workspaceId }
repo_label_updated   { id, label }
```

### Chat (updated)

```
chat_created         { id, workspaceId, repoId, title, provider }
```

All existing chat events keep their shape, but `projectId` → `workspaceId` and repo-scoped chat ownership becomes explicit via `repoId`.

### Coordination (rekey only)

All existing coordination events (`todo_added`, `todo_claimed`, `claim_created`, etc.) change `projectId` → `workspaceId`. No other structural changes. NATS subjects rename in Phase 1: `runtime.cmd.project.*` → `runtime.cmd.workspace.*`, `runtime.evt.project.*` → `runtime.evt.workspace.*`, `runtime.snap.project.*` → `runtime.snap.workspace.*`. No legacy `project.*` wire format is maintained.

### Workflow Execution

```
workflow_started     { runId, workflowId, workspaceId, targetRepoIds }
workflow_step_completed  { runId, stepIndex, output }
workflow_step_failed     { runId, stepIndex, error }
workflow_completed   { runId, results }
workflow_failed      { runId, error, failedStep }
```

### Agent Config

```
agent_config_saved      { workspaceId, agentId, config }
agent_config_committed  { workspaceId, agentId, commitHash }
agent_config_removed    { workspaceId, agentId }
```

## Workspace Directory Structure

```
~/.tinkaria/workspaces/<id>/
  .git/                     # auto-initialized, free versioning
  agents/                   # agent configuration YAML files
    review-agent.yaml
    deploy-agent.yaml
  workflows/                # workflow definitions
    sync-all.yaml
    test-and-push.yaml
```

Agent configs and workflows are files in a git-tracked directory. Tinkaria manages the git lifecycle (commit on save, rollback via git). Coordination state stays in the central EventStore.

## Workflow Model

A workflow is a sequence of steps that target repos using MCP tools:

```yaml
name: Sync and Test
trigger: manual                     # or cron, or on-event
target: all                         # or specific repoId
steps:
  - mcp_tool: git.pull
    params:
      branch: main
  - mcp_tool: test.run
    params:
      command: "bun test"
  - mcp_tool: notify
    params:
      message: "Sync complete"
on_failure: stop                    # or continue, or rollback
```

Workflows execute inside the workspace's sandbox. Steps are MCP tool invocations. The workflow engine resolves `target: all` to all repos in the workspace.

Phase 1 workflow execution is still subordinate to the browser product. The workflow engine should start from first-party/allowlisted behavior and avoid assuming a general arbitrary-tool automation surface on day one.

## Sandbox Architecture

Each workspace gets a Docker container for execution isolation:

```
+------------------------------------------+
|           Tinkaria Host                  |
|  EventStore  |  NATS  |  Workspace Mgr  |
+------+-------+--------+--------+--------+
       |                         |
  NATS |                    NATS |
       v                         v
+----------------+    +----------------+
| Workspace A    |    | Workspace B    |
| Container      |    | Container      |
|                |    |                |
| Repos (vol)    |    | Repos (vol)    |
| MCP Tools      |    | MCP Tools      |
| Agent Runtime  |    | Agent Runtime  |
| Workflow Engine|    | Workflow Engine |
+----------------+    +----------------+
```

**Coordination boundary = NATS.** Same pattern as existing `NatsCoordinationClient`. The sandbox:
- Mounts repos as volumes (clone-in or bind-mount)
- Runs agent runtime + workflow engine
- Communicates coordination state via NATS request/reply to host EventStore
- Has resource limits (CPU, memory, disk)
- Cannot access other workspace containers

**Sandbox is an eventual goal, not a day-one requirement.** Initial implementation runs everything in-process. Today, NATS already provides a coordination seam, but provider runtime ownership, restart recovery, and transcript replay are still separate concerns and should be planned explicitly rather than treated as automatically solved by containerization.

## Policies (Async Reactions)

| Policy | Trigger Event | Action | Emits |
|--------|---------------|--------|-------|
| GitClonePolicy | `repo_clone_started` | Clone origin to target path | `repo_cloned` / `repo_clone_failed` |
| ConflictDetection | `claim_created` | Check file overlaps across workspace | `claim_conflict_detected` |
| GitCommitPolicy | `agent_config_saved` | Commit to workspace git dir | `agent_config_committed` |
| CleanupPolicy | `repo_removed` | Archive the repo and archive its chats | `chat_archived` / repo archive marker |

## Read Models

| Read Model | Source | Consumer |
|------------|--------|----------|
| WorkspaceList | `workspacesById` | Sidebar, workspace picker |
| RepoList | `reposById` filtered by workspaceId | Workspace detail page |
| Sidebar | `chatsById` grouped by workspace, then repo | Main navigation |
| CoordinationSnapshot | `coordinationByWorkspace` | Dashboard panels |
| RepoStatus | `reposById` + live git status | Repo list, sync indicators |
| WorkflowRuns | workflow events | Workflow history panel |
| AgentCatalog | workspace config dir | Agent config UI |
| SessionList | repo-scoped discovery/readback | Repo chat surfaces, resume picker |

## What Gets Renamed (Rename-in-Place)

This is not a pure text rename. It is a systematic project → workspace rename plus a new first-class repo child entity, with repo-scoped chat/session semantics preserved for the first implementation slice:

| Current | New |
|---------|-----|
| `ProjectRecord` | `WorkspaceRecord` (+ configPath, drop localPath) |
| `ProjectSummary` | `WorkspaceSummary` |
| `projectsById` | `workspacesById` |
| `projectIdsByPath` | `reposByPath` (localPath → repoId) |
| `ChatRecord.projectId` | `ChatRecord.workspaceId` + `ChatRecord.repoId` |
| `coordinationByProject` | `coordinationByWorkspace` |
| `ProjectCoordinationState` | `WorkspaceCoordinationState` |
| `ProjectCoordinationSnapshot` | `WorkspaceCoordinationSnapshot` |
| `ProjectTodo` / `ProjectClaim` etc | `WorkspaceTodo` / `WorkspaceClaim` etc |
| `ProjectAgent` | `WorkspaceAgent` |
| `deriveProjectCoordinationSnapshot` | `deriveWorkspaceCoordinationSnapshot` |
| `runtime.cmd.project.todo.add` (NATS) | `runtime.cmd.workspace.todo.add` |
| `runtime.evt.project.*` (NATS) | `runtime.evt.workspace.*` |
| `runtime.snap.project.*` (NATS) | `runtime.snap.workspace.*` |
| `project.{id}` (KV key) | `workspace.{id}` |
| `ProjectPage` (React) | `WorkspacePage` |
| `useProjectSubscription` | `useWorkspaceSubscription` |
| `/project/:id` route | `/workspace/:id` route |

The implementation plan should treat chat/session/runtime seams as real architecture work, not as incidental fallout from a string rename.

## New Components

| Component | Responsibility |
|-----------|---------------|
| `RepoRecord` + events | Entity type in EventStore for repo lifecycle |
| `RepoManager` | Git operations: clone, pull, push, status |
| `WorkflowEngine` | Parse YAML, execute steps via MCP, track runs |
| `WorkspaceConfigManager` | Read/write agent configs + workflows from workspace git dir |
| `SandboxManager` (future) | Docker container lifecycle per workspace |

## Migration

There is no production migration burden, but there is persistent local state. The implementation plan must explicitly choose one of these strategies:

1. Bump the store version and intentionally reset local project/chat state.
2. Write a local migration from project-shaped state/events to workspace+repo state/events.

That choice should be made before Phase 1 starts rather than left implicit.

## Implementation Phases

1. **Structured rename foundation**: Project → Workspace across all code, including NATS subjects (`project.*` → `workspace.*`) and coordination types (`ProjectTodo` → `WorkspaceTodo`, etc.) — no deferred renames. Add `RepoRecord` entity. Keep chats/sessions repo-scoped. Choose local-state migration strategy (version bump + reset OR event migration) before starting. Update EventStore state shape.
2. **Workspace directory**: Create `~/.tinkaria/workspaces/<id>/` with git init. Agent config read/write.
3. **Repo management**: AddRepo, CloneRepo, RemoveRepo commands. Git operations (clone, pull, push).
4. **Workflow engine**: YAML parsing, first-party/allowlisted step execution via MCP tools, run tracking.
5. **Sandbox** (future): Docker container per workspace, with coordination, runtime ownership, and replay/reattach boundaries planned explicitly.

Phases 1-2 are the foundation. Phase 3 makes workspaces useful. Phase 4 enables automation. Phase 5 is the isolation goal.
