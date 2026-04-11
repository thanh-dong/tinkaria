import type { ProjectCoordinationState } from "../server/events"
import type { WorkspaceCoordinationSnapshot, TodoPriority } from "./workspace-types"

/**
 * Minimal interface for project coordination operations.
 * Implemented by EventStore (server-side, in-process) and
 * NatsCoordinationClient (runner-side, over NATS).
 */
export interface CoordinationStore {
  state: {
    coordinationByProject: Map<string, ProjectCoordinationState>
  }
  addTodo(projectId: string, todoId: string, description: string, priority: TodoPriority, createdBy: string): Promise<void>
  claimTodo(projectId: string, todoId: string, sessionId: string): Promise<void>
  completeTodo(projectId: string, todoId: string, outputs: string[]): Promise<void>
  abandonTodo(projectId: string, todoId: string): Promise<void>
  createClaim(projectId: string, claimId: string, intent: string, files: string[], sessionId: string): Promise<void>
  releaseClaim(projectId: string, claimId: string): Promise<void>
  createWorktree(projectId: string, worktreeId: string, branch: string, baseBranch: string, path: string): Promise<void>
  assignWorktree(projectId: string, worktreeId: string, sessionId: string): Promise<void>
  removeWorktree(projectId: string, worktreeId: string): Promise<void>
  setRule(projectId: string, ruleId: string, content: string, setBy: string): Promise<void>
  removeRule(projectId: string, ruleId: string): Promise<void>
  /** Optional: fetch a full coordination snapshot (used when state is not in-process). */
  getSnapshot?(projectId: string): Promise<WorkspaceCoordinationSnapshot>
}
