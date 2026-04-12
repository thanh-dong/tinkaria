export interface AgentConfig {
  id: string
  name: string
  description: string
  provider: "claude" | "codex"
  model: string
  systemPrompt?: string
  tools?: string[]
  temperature?: number
}

export interface AgentConfigRecord {
  id: string
  workspaceId: string
  config: AgentConfig
  createdAt: number
  updatedAt: number
  lastCommitHash?: string
}

export interface AgentConfigSnapshot {
  workspaceId: string
  configs: AgentConfigRecord[]
  lastUpdated: string
}
