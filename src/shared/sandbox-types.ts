export type SandboxStatus = "creating" | "running" | "stopped" | "error"

export interface ResourceLimits {
  cpuShares: number
  memoryMb: number
  diskMb: number
  pidsLimit: number
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  cpuShares: 512,
  memoryMb: 2048,
  diskMb: 10240,
  pidsLimit: 256,
}

export interface SandboxRecord {
  id: string
  workspaceId: string
  containerId: string | null
  status: SandboxStatus
  resourceLimits: ResourceLimits
  natsUrl: string
  createdAt: number
  updatedAt: number
  lastHealthCheck: number | null
  error: string | null
}

export interface SandboxHealthReport {
  sandboxId: string
  workspaceId: string
  status: "healthy" | "unhealthy" | "unreachable"
  uptimeMs: number
  memoryUsageMb: number
  cpuPercent: number
  natsConnected: boolean
}

export interface ContainerInspect {
  id: string
  status: string
  running: boolean
  startedAt: string
  memoryUsage: number
  cpuPercent: number
}

export interface SandboxSnapshot {
  workspaceId: string
  sandbox: SandboxRecord | null
  health: SandboxHealthReport | null
}
