import { useCallback, useMemo } from "react"
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
import { getPathBasename } from "../lib/formatters"
import { toastCommand } from "../lib/toast"

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function WorkspacePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const state = useOutletContext<AppState>()
  const snapshot = useWorkspaceSubscription(state.socket, workspaceId ?? null)

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
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-px bg-border min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border">
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
      </div>
    </div>
  )
}
