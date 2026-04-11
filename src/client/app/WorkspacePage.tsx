import { useCallback } from "react"
import { useOutletContext, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import type { TodoPriority } from "../../shared/workspace-types"
import { useWorkspaceSubscription } from "./useWorkspaceSubscription"
import { PageHeader } from "./PageHeader"
import { TodosPanel } from "../components/coordination/TodosPanel"
import { ClaimsPanel } from "../components/coordination/ClaimsPanel"
import { WorktreesPanel } from "../components/coordination/WorktreesPanel"
import { RulesPanel } from "../components/coordination/RulesPanel"
import type { AppState } from "./useAppState"

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function WorkspacePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const state = useOutletContext<AppState>()
  const snapshot = useWorkspaceSubscription(state.socket, workspaceId ?? null)

  const handleAddTodo = useCallback(
    (description: string, priority: TodoPriority) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.todo.add",
        workspaceId,
        todoId: generateId("todo"),
        description,
        priority,
      })
    },
    [workspaceId, state.socket]
  )

  const handleClaimTodo = useCallback(
    (todoId: string, sessionId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.todo.claim",
        workspaceId,
        todoId,
        sessionId,
      })
    },
    [workspaceId, state.socket]
  )

  const handleCompleteTodo = useCallback(
    (todoId: string, outputs: string[]) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.todo.complete",
        workspaceId,
        todoId,
        outputs,
      })
    },
    [workspaceId, state.socket]
  )

  const handleAbandonTodo = useCallback(
    (todoId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.todo.abandon",
        workspaceId,
        todoId,
      })
    },
    [workspaceId, state.socket]
  )

  const handleCreateClaim = useCallback(
    (intent: string, files: string[], sessionId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.claim.create",
        workspaceId,
        claimId: generateId("claim"),
        intent,
        files,
        sessionId,
      })
    },
    [workspaceId, state.socket]
  )

  const handleReleaseClaim = useCallback(
    (claimId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.claim.release",
        workspaceId,
        claimId,
      })
    },
    [workspaceId, state.socket]
  )

  const handleCreateWorktree = useCallback(
    (branch: string, baseBranch: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.worktree.create",
        workspaceId,
        worktreeId: generateId("wt"),
        branch,
        baseBranch,
      })
    },
    [workspaceId, state.socket]
  )

  const handleAssignWorktree = useCallback(
    (worktreeId: string, sessionId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.worktree.assign",
        workspaceId,
        worktreeId,
        sessionId,
      })
    },
    [workspaceId, state.socket]
  )

  const handleRemoveWorktree = useCallback(
    (worktreeId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.worktree.remove",
        workspaceId,
        worktreeId,
      })
    },
    [workspaceId, state.socket]
  )

  const handleSetRule = useCallback(
    (ruleId: string, content: string, setBy: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.rule.set",
        workspaceId,
        ruleId,
        content,
        setBy,
      })
    },
    [workspaceId, state.socket]
  )

  const handleRemoveRule = useCallback(
    (ruleId: string) => {
      if (!workspaceId) return
      void state.socket.command({
        type: "workspace.rule.remove",
        workspaceId,
        ruleId,
      })
    },
    [workspaceId, state.socket]
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
      <PageHeader title="Project Coordination" subtitle={workspaceId} />
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
