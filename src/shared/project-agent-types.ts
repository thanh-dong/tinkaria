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

export type TaskStatus = "claimed" | "in_progress" | "complete" | "abandoned"

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

export interface SearchDocument {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  text: string
  filePaths: string[]
  toolNames: string[]
  errorNames: string[]
}

export interface SearchResult {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  fragment: string
  score: number
}

// --- ResourceRegistry types ---

export type LeaseType = "exclusive" | "shared"
export type ResourceKind = "database" | "cache" | "service" | "process"
export type ResourceStatus = "running" | "stopped" | "starting"
export type ResourceManager = "zerobased" | "docker" | "manual"

export interface ResourceLease {
  id: string
  resource: string
  type: LeaseType
  heldBy: string
  fencingToken: number
  expiresAt: string
  metadata: Record<string, string>
}

export interface ResourceState {
  name: string
  kind: ResourceKind
  status: ResourceStatus
  managedBy: ResourceManager
  connectionString: string | null
  leases: ResourceLease[]
}

// --- ProjectAgent types ---

export interface DelegationResult {
  status: "ok" | "blocked" | "error"
  message: string
  data?: Record<string, unknown>
}

// --- CLI output types ---

export interface CliError {
  error: string
  code: number
  detail?: string
}
