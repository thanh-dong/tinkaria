import { useCallback, useMemo } from "react"
import { useOutletContext, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import type { TodoPriority } from "../../shared/workspace-types"
import type { AgentConfig } from "../../shared/agent-config-types"
import { useWorkspaceSubscription } from "./useWorkspaceSubscription"
import { useAgentConfigSubscription } from "./useAgentConfigSubscription"
import { useRepoSubscription } from "./useRepoSubscription"
import { useWorkflowRunsSubscription } from "./useWorkflowRunsSubscription"
import { useSandboxSubscription } from "./useSandboxSubscription"
import { PageHeader } from "./PageHeader"
import { TodosPanel } from "../components/coordination/TodosPanel"
import { ClaimsPanel } from "../components/coordination/ClaimsPanel"
import { WorktreesPanel } from "../components/coordination/WorktreesPanel"
import { RulesPanel } from "../components/coordination/RulesPanel"
import { AgentConfigPanel } from "../components/coordination/AgentConfigPanel"
import { RepoPanel } from "../components/coordination/RepoPanel"
import { WorkflowPanel } from "../components/coordination/WorkflowPanel"
import { SandboxPanel } from "../components/coordination/SandboxPanel"
import type { AppState } from "./useAppState"
import { getPathBasename } from "../lib/formatters"
import { toastCommand } from "../lib/toast"

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function WorkspacePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const state = useOutletContext<AppState>()
  const snapshot = useWorkspaceSubscription(state.socket, workspaceId ?? null)
  const agentSnap = useAgentConfigSubscription(state.socket, workspaceId ?? null)
  const repoSnap = useRepoSubscription(state.socket, workspaceId ?? null)
  const workflowSnap = useWorkflowRunsSubscription(state.socket, workspaceId ?? null)
  const sandboxSnap = useSandboxSubscription(state.socket, workspaceId ?? null)

  const sessionsSnap = workspaceId ? state.sessionsSnapshots.get(workspaceId) : undefined
  const sessionOptions = useMemo(() => {
    if (!sessionsSnap) return []
    return sessionsSnap.sessions.map((s) => ({
      sessionId: s.sessionId,
      label: s.title || s.sessionId.slice(0, 12),
    }))
  }, [sessionsSnap])

  const handleAddTodo = useCallback(
    (description: string, priority: TodoPriority) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.todo.add",
        workspaceId,
        todoId: generateId("todo"),
        description,
        priority,
      }), "Todo added")
    },
    [workspaceId, state.socket]
  )

  const handleClaimTodo = useCallback(
    (todoId: string, sessionId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.todo.claim",
        workspaceId,
        todoId,
        sessionId,
      }), "Todo claimed")
    },
    [workspaceId, state.socket]
  )

  const handleCompleteTodo = useCallback(
    (todoId: string, outputs: string[]) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.todo.complete",
        workspaceId,
        todoId,
        outputs,
      }), "Todo completed")
    },
    [workspaceId, state.socket]
  )

  const handleAbandonTodo = useCallback(
    (todoId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.todo.abandon",
        workspaceId,
        todoId,
      }), "Todo abandoned")
    },
    [workspaceId, state.socket]
  )

  const handleCreateClaim = useCallback(
    (intent: string, files: string[], sessionId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.claim.create",
        workspaceId,
        claimId: generateId("claim"),
        intent,
        files,
        sessionId,
      }), "Claim created")
    },
    [workspaceId, state.socket]
  )

  const handleReleaseClaim = useCallback(
    (claimId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.claim.release",
        workspaceId,
        claimId,
      }), "Claim released")
    },
    [workspaceId, state.socket]
  )

  const handleCreateWorktree = useCallback(
    (branch: string, baseBranch: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.worktree.create",
        workspaceId,
        worktreeId: generateId("wt"),
        branch,
        baseBranch,
      }), "Worktree created")
    },
    [workspaceId, state.socket]
  )

  const handleAssignWorktree = useCallback(
    (worktreeId: string, sessionId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.worktree.assign",
        workspaceId,
        worktreeId,
        sessionId,
      }), "Worktree assigned")
    },
    [workspaceId, state.socket]
  )

  const handleRemoveWorktree = useCallback(
    (worktreeId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.worktree.remove",
        workspaceId,
        worktreeId,
      }), "Worktree removed")
    },
    [workspaceId, state.socket]
  )

  const handleSetRule = useCallback(
    (ruleId: string, content: string, setBy: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.rule.set",
        workspaceId,
        ruleId,
        content,
        setBy,
      }), "Rule saved")
    },
    [workspaceId, state.socket]
  )

  const handleRemoveRule = useCallback(
    (ruleId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.rule.remove",
        workspaceId,
        ruleId,
      }), "Rule removed")
    },
    [workspaceId, state.socket]
  )

  const handleSaveAgent = useCallback(
    (config: AgentConfig) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.agent.save",
        workspaceId,
        config,
      }), "Agent config saved")
    },
    [workspaceId, state.socket]
  )

  const handleRemoveAgent = useCallback(
    (agentId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.agent.remove",
        workspaceId,
        agentId,
      }), "Agent config removed")
    },
    [workspaceId, state.socket]
  )

  const handleAddRepo = useCallback(
    (localPath: string, label?: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.repo.add",
        workspaceId,
        localPath,
        label,
      }), "Repo added")
    },
    [workspaceId, state.socket]
  )

  const handleCloneRepo = useCallback(
    (origin: string, targetPath: string, label?: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.repo.clone",
        workspaceId,
        origin,
        targetPath,
        label,
      }), "Repo clone started")
    },
    [workspaceId, state.socket]
  )

  const handleRemoveRepo = useCallback(
    (repoId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.repo.remove",
        workspaceId,
        repoId,
      }), "Repo removed")
    },
    [workspaceId, state.socket]
  )

  const handlePullRepo = useCallback(
    (repoId: string) => {
      toastCommand(state.socket.command({
        type: "workspace.repo.pull",
        repoId,
      }), "Pull started")
    },
    [state.socket]
  )

  const handleCancelWorkflow = useCallback(
    (runId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.workflow.cancel",
        workspaceId,
        runId,
      }), "Workflow cancelled")
    },
    [workspaceId, state.socket]
  )

  const handlePushRepo = useCallback(
    (repoId: string) => {
      toastCommand(state.socket.command({
        type: "workspace.repo.push",
        repoId,
      }), "Push started")
    },
    [state.socket]
  )

  if (!workspaceId) {
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
      <PageHeader title="Project Coordination" subtitle={getPathBasename(workspaceId)} />
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-px bg-border min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border">
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
            sessions={sessionOptions}
            onCreateClaim={handleCreateClaim}
            onReleaseClaim={handleReleaseClaim}
          />
        </div>
        <div className="bg-background overflow-hidden">
          <WorktreesPanel
            worktrees={snapshot.worktrees}
            sessions={sessionOptions}
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
        <div className="bg-background overflow-hidden">
          <RepoPanel
            repos={repoSnap?.repos ?? []}
            onAddRepo={handleAddRepo}
            onCloneRepo={handleCloneRepo}
            onRemoveRepo={handleRemoveRepo}
            onPullRepo={handlePullRepo}
            onPushRepo={handlePushRepo}
          />
        </div>
        <div className="bg-background overflow-hidden">
          <AgentConfigPanel
            configs={agentSnap?.configs ?? []}
            onSave={handleSaveAgent}
            onRemove={handleRemoveAgent}
          />
        </div>
        <div className="bg-background overflow-hidden">
          <WorkflowPanel
            runs={workflowSnap?.runs ?? []}
            activeRunIds={workflowSnap?.activeRunIds ?? []}
            onCancelRun={handleCancelWorkflow}
          />
        </div>
        {workspaceId && (
          <div className="bg-background overflow-hidden">
            <SandboxPanel
              snapshot={sandboxSnap}
              onCommand={(cmd) => { void state.socket.command(cmd) }}
              workspaceId={workspaceId}
            />
          </div>
        )}
      </div>
    </div>
  )
}
