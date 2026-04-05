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

// --- TaskLedger types ---

export type TaskStatus = "claimed" | "complete" | "abandoned"

export interface TaskEntry {
  id: string
  description: string
  ownedBy: string
  status: TaskStatus
  branch: string | null
  outputs: string[]
  claimedAt: string
  updatedAt: string
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

// --- ProjectAgent types ---

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
