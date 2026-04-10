import { useCallback } from "react"
import { useOutletContext, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
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
