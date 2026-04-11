# Workspace Architecture Design

**Date:** 2026-04-11
**Status:** Draft
**Approach:** Rename-in-place (Project → Workspace)

## Overview

Replace the "project" concept with "workspace" as the top-level organizational unit. A workspace manages multiple repos, owns coordination state (todos, claims, worktrees, rules), agent configurations, and workflows. Execution is sandboxed per workspace via Docker.

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
  repoId: string | null       // which repo this chat targets, null for workspace-level chats
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
  todos: Map<string, ProjectTodo>       // rename to WorkspaceTodo later
  claims: Map<string, ProjectClaim>     // rename to WorkspaceClaim later
  worktrees: Map<string, ProjectWorktree>
  rules: Map<string, ProjectRule>       // rename to WorkspaceRule later
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

All existing chat events keep their shape, but `projectId` → `workspaceId`.

### Coordination (rekey only)

All existing coordination events (`todo_added`, `todo_claimed`, `claim_created`, etc.) change `projectId` → `workspaceId`. No other structural changes.

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

**Host ↔ Sandbox boundary = NATS.** Same pattern as existing `NatsCoordinationClient`. The sandbox:
- Mounts repos as volumes (clone-in or bind-mount)
- Runs agent runtime + workflow engine
- Communicates coordination state via NATS request/reply to host EventStore
- Has resource limits (CPU, memory, disk)
- Cannot access other workspace containers

**Sandbox is an eventual goal, not a day-one requirement.** Initial implementation runs everything in-process. The NATS boundary already exists and naturally becomes the container boundary when Docker is introduced.

## Policies (Async Reactions)

| Policy | Trigger Event | Action | Emits |
|--------|---------------|--------|-------|
| GitClonePolicy | `repo_clone_started` | Clone origin to target path | `repo_cloned` / `repo_clone_failed` |
| ConflictDetection | `claim_created` | Check file overlaps across workspace | `claim_conflict_detected` |
| GitCommitPolicy | `agent_config_saved` | Commit to workspace git dir | `agent_config_committed` |
| CleanupPolicy | `repo_removed` | Handle orphaned chats | (archive or reassign) |

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

## What Gets Renamed (Rename-in-Place)

This is a systematic rename with no new abstractions beyond repo management, workflows, and sandbox:

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
| `project.todo.add` (NATS subject) | `workspace.todo.add` |
| `project.coordination.snapshot` | `workspace.coordination.snapshot` |
| `ProjectPage` (React) | `WorkspacePage` |
| `useProjectSubscription` | `useWorkspaceSubscription` |
| `/project/:id` route | `/workspace/:id` route |

## New Components

| Component | Responsibility |
|-----------|---------------|
| `RepoRecord` + events | Entity type in EventStore for repo lifecycle |
| `RepoManager` | Git operations: clone, pull, push, status |
| `WorkflowEngine` | Parse YAML, execute steps via MCP, track runs |
| `WorkspaceConfigManager` | Read/write agent configs + workflows from workspace git dir |
| `SandboxManager` (future) | Docker container lifecycle per workspace |

## Migration

No data migration needed — there's no production data. This is a clean replacement of the project concept with workspace.

## Implementation Phases

1. **Rename-in-place**: Project → Workspace across all code. Add `RepoRecord` entity. Update EventStore state shape.
2. **Workspace directory**: Create `~/.tinkaria/workspaces/<id>/` with git init. Agent config read/write.
3. **Repo management**: AddRepo, CloneRepo, RemoveRepo commands. Git operations (clone, pull, push).
4. **Workflow engine**: YAML parsing, step execution via MCP tools, run tracking.
5. **Sandbox** (future): Docker container per workspace, NATS as boundary.

Phases 1-2 are the foundation. Phase 3 makes workspaces useful. Phase 4 enables automation. Phase 5 is the isolation goal.
