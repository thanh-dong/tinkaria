import type { AgentProvider, WorkspaceSummary, TranscriptEntry } from "../shared/types"
import type { WorkspaceTodo, WorkspaceClaim, WorkspaceWorktree, WorkspaceRule } from "../shared/workspace-types"

export interface WorkspaceRecord extends WorkspaceSummary {
  deletedAt?: number
}

export interface RepoRecord {
  id: string
  workspaceId: string
  origin: string | null
  localPath: string
  label: string | null
  status: "cloned" | "pending" | "error"
  branch: string | null
  createdAt: number
  updatedAt: number
}

export interface ChatRecord {
  id: string
  workspaceId: string
  repoId: string | null
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

export interface WorkspaceCoordinationState {
  todos: Map<string, WorkspaceTodo>
  claims: Map<string, WorkspaceClaim>
  worktrees: Map<string, WorkspaceWorktree>
  rules: Map<string, WorkspaceRule>
  lastUpdated: string
}

export interface StoreState {
  workspacesById: Map<string, WorkspaceRecord>
  workspaceIdsByPath: Map<string, string>
  chatsById: Map<string, ChatRecord>
  coordinationByWorkspace: Map<string, WorkspaceCoordinationState>
}

export function createEmptyCoordinationState(): WorkspaceCoordinationState {
  return {
    todos: new Map(),
    claims: new Map(),
    worktrees: new Map(),
    rules: new Map(),
    lastUpdated: new Date(0).toISOString(),
  }
}

export interface SnapshotFile {
  v: 2 | 3
  generatedAt: number
  workspaces: WorkspaceRecord[]
  chats: ChatRecord[]
  messages?: Array<{ chatId: string; entries: TranscriptEntry[] }>
  coordination?: Array<{ workspaceId: string; todos: WorkspaceTodo[]; claims: WorkspaceClaim[]; worktrees: WorkspaceWorktree[]; rules: WorkspaceRule[] }>
}

export type WorkspaceEvent = {
  v: 3
  type: "workspace_opened"
  timestamp: number
  workspaceId: string
  localPath: string
  title: string
} | {
  v: 3
  type: "workspace_removed"
  timestamp: number
  workspaceId: string
}

export type ChatEvent =
  | {
      v: 3
      type: "chat_created"
      timestamp: number
      chatId: string
      workspaceId: string
      title: string
    }
  | {
      v: 3
      type: "chat_renamed"
      timestamp: number
      chatId: string
      title: string
    }
  | {
      v: 3
      type: "chat_deleted"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "chat_provider_set"
      timestamp: number
      chatId: string
      provider: AgentProvider
    }
  | {
      v: 3
      type: "chat_model_set"
      timestamp: number
      chatId: string
      model: string | null
    }
  | {
      v: 3
      type: "chat_plan_mode_set"
      timestamp: number
      chatId: string
      planMode: boolean
    }
  | {
      v: 3
      type: "chat_read_state_set"
      timestamp: number
      chatId: string
      unread: boolean
    }

export type MessageEvent = {
  v: 3
  type: "message_appended"
  timestamp: number
  chatId: string
  entry: TranscriptEntry
}

export type TurnEvent =
  | {
      v: 3
      type: "turn_started"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "turn_finished"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "turn_failed"
      timestamp: number
      chatId: string
      error: string
    }
  | {
      v: 3
      type: "turn_cancelled"
      timestamp: number
      chatId: string
    }
  | {
      v: 3
      type: "session_token_set"
      timestamp: number
      chatId: string
      sessionToken: string | null
    }

export type CoordinationEvent =
  | { v: 3; type: "todo_added"; timestamp: number; workspaceId: string; todoId: string; description: string; priority: "high" | "normal" | "low"; createdBy: string }
  | { v: 3; type: "todo_claimed"; timestamp: number; workspaceId: string; todoId: string; claimedBy: string }
  | { v: 3; type: "todo_completed"; timestamp: number; workspaceId: string; todoId: string; outputs: string[] }
  | { v: 3; type: "todo_abandoned"; timestamp: number; workspaceId: string; todoId: string }
  | { v: 3; type: "claim_created"; timestamp: number; workspaceId: string; claimId: string; intent: string; files: string[]; sessionId: string }
  | { v: 3; type: "claim_released"; timestamp: number; workspaceId: string; claimId: string }
  | { v: 3; type: "claim_conflict_detected"; timestamp: number; workspaceId: string; claimId: string; conflictsWith: string; overlappingFiles: string[] }
  | { v: 3; type: "worktree_created"; timestamp: number; workspaceId: string; worktreeId: string; branch: string; baseBranch: string; path: string }
  | { v: 3; type: "worktree_assigned"; timestamp: number; workspaceId: string; worktreeId: string; sessionId: string }
  | { v: 3; type: "worktree_removed"; timestamp: number; workspaceId: string; worktreeId: string }
  | { v: 3; type: "rule_set"; timestamp: number; workspaceId: string; ruleId: string; content: string; setBy: string }
  | { v: 3; type: "rule_removed"; timestamp: number; workspaceId: string; ruleId: string }

export type StoreEvent = WorkspaceEvent | ChatEvent | MessageEvent | TurnEvent | CoordinationEvent

export function createEmptyState(): StoreState {
  return {
    workspacesById: new Map(),
    workspaceIdsByPath: new Map(),
    chatsById: new Map(),
    coordinationByWorkspace: new Map(),
  }
}

export function cloneTranscriptEntries(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.map((entry) => ({ ...entry }))
}
