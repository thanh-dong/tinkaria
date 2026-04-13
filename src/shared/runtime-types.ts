export type RuntimeSource = "managed" | "system"

export interface RuntimeEntry {
  provider: "claude" | "codex"
  version: string
  source: RuntimeSource
  binaryPath: string
  installedAt: number
  packageName: string
}

export interface RuntimeHealthStatus {
  provider: string
  version: string
  binaryPath: string
  status: "healthy" | "degraded" | "unavailable"
  lastChecked: number
  error?: string
  latencyMs: number
}

export interface RuntimeRegistryState {
  entries: RuntimeEntry[]
  defaults: Record<string, string>
}

export interface RuntimeSnapshot {
  runtimes: (RuntimeEntry & { health: RuntimeHealthStatus })[]
}
