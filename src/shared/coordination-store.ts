import type { WorkspaceCoordinationState } from "../server/events"
import type { WorkspaceCoordinationSnapshot, TodoPriority } from "./workspace-types"

/**
 * Minimal interface for project coordination operations.
 * Implemented by EventStore (server-side, in-process) and
 * NatsCoordinationClient (runner-side, over NATS).
 */
export interface CoordinationStore {
  state: {
    coordinationByWorkspace: Map<string, WorkspaceCoordinationState>
  }
  addTodo(workspaceId: string, todoId: string, description: string, priority: TodoPriority, createdBy: string): Promise<void>
  claimTodo(workspaceId: string, todoId: string, sessionId: string): Promise<void>
  completeTodo(workspaceId: string, todoId: string, outputs: string[]): Promise<void>
  abandonTodo(workspaceId: string, todoId: string): Promise<void>
  createClaim(workspaceId: string, claimId: string, intent: string, files: string[], sessionId: string): Promise<void>
  releaseClaim(workspaceId: string, claimId: string): Promise<void>
  createWorktree(workspaceId: string, worktreeId: string, branch: string, baseBranch: string, path: string): Promise<void>
  assignWorktree(workspaceId: string, worktreeId: string, sessionId: string): Promise<void>
  removeWorktree(workspaceId: string, worktreeId: string): Promise<void>
  setRule(workspaceId: string, ruleId: string, content: string, setBy: string): Promise<void>
  removeRule(workspaceId: string, ruleId: string): Promise<void>
  /** Optional: fetch a full coordination snapshot (used when state is not in-process). */
  getSnapshot?(workspaceId: string): Promise<WorkspaceCoordinationSnapshot>
}
