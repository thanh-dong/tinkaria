export type WorkflowTrigger = "manual" | { cron: string } | { on_event: string }
export type WorkflowTarget = "all" | string

export interface WorkflowStep {
  mcp_tool: string
  params: Record<string, unknown>
  label?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  trigger: WorkflowTrigger
  target: WorkflowTarget
  steps: WorkflowStep[]
  on_failure: "stop" | "continue" | "rollback"
}

export type WorkflowRunStatus = "running" | "completed" | "failed" | "cancelled"

export interface WorkflowRunStepResult {
  stepIndex: number
  label?: string
  mcp_tool: string
  repoId?: string
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  output?: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface WorkflowRunState {
  runId: string
  workflowId: string
  workspaceId: string
  targetRepoIds: string[]
  status: WorkflowRunStatus
  steps: WorkflowRunStepResult[]
  startedAt: number
  completedAt?: number
  failedStep?: number
  error?: string
  triggeredBy: string
}

export interface WorkflowRunsSnapshot {
  workspaceId: string
  runs: WorkflowRunState[]
  activeRunIds: string[]
}
