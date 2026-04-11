import type { AgentProvider } from "./types"

// --- SessionIndex types ---

export type SessionStatus = "active" | "idle" | "complete" | "failed"

export interface SessionRecord {
  chatId: string
  intent: string
  status: SessionStatus
  provider: AgentProvider
  branch: string | null
  filesTouched: string[]
  commandsRun: string[]
  lastActivity: string
}


// --- TranscriptSearch types ---

export type SearchDocumentKind = "user_prompt" | "assistant_text" | "tool_call" | "tool_result"

export interface SearchResult {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  fragment: string
  score: number
}

// --- WorkspaceAgent types ---

export interface DelegationResult {
  status: "ok" | "error"
  message: string
  data?: Record<string, unknown>
}

// --- CLI output types ---

export interface CliError {
  error: string
  code: number
  detail?: string
}

// --- Coordination types ---

export type TodoPriority = "high" | "normal" | "low"
export type CoordinationTodoStatus = "open" | "claimed" | "complete" | "abandoned"
export type ClaimStatus = "active" | "released" | "conflict"
export type WorktreeStatus = "ready" | "assigned" | "removed"

export interface WorkspaceTodo {
  id: string
  description: string
  priority: TodoPriority
  status: CoordinationTodoStatus
  claimedBy: string | null
  outputs: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceClaim {
  id: string
  intent: string
  files: string[]
  sessionId: string
  status: ClaimStatus
  conflictsWith: string | null
  createdAt: string
}

export interface WorkspaceWorktree {
  id: string
  branch: string
  baseBranch: string
  path: string
  assignedTo: string | null
  status: WorktreeStatus
  createdAt: string
}

export interface WorkspaceRule {
  id: string
  content: string
  setBy: string
  updatedAt: string
}

export interface WorkspaceCoordinationSnapshot {
  workspaceId: string
  todos: WorkspaceTodo[]
  claims: WorkspaceClaim[]
  worktrees: WorkspaceWorktree[]
  rules: WorkspaceRule[]
  lastUpdated: string
}
