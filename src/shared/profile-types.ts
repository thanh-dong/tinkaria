import type { ModelOptions } from "./types"

export interface ProviderProfile {
  id: string
  name: string
  provider: "claude" | "codex"
  runtime: { version: string } | "system"
  model: string
  modelOptions?: ModelOptions
  apiKeyRef?: string
  systemPrompt?: string
  skills?: string[]
  plugins?: string[]
  env?: Record<string, string>
}

export interface WorkspaceProfileOverride {
  profileId: string
  workspaceId: string
  overrides: Partial<Omit<ProviderProfile, "id" | "provider">>
  updatedAt: number
}

export interface ProviderProfileRecord {
  id: string
  profile: ProviderProfile
  createdAt: number
  updatedAt: number
}

export interface ProfileSnapshot {
  profiles: ProviderProfileRecord[]
  workspaceOverrides: WorkspaceProfileOverride[]
}

export function resolveProfile(
  global: ProviderProfile,
  override?: Partial<Omit<ProviderProfile, "id" | "provider">>,
): ProviderProfile {
  if (!override) return global
  return {
    ...global,
    ...override,
    env: override.env ? { ...global.env, ...override.env } : global.env,
    modelOptions: override.modelOptions
      ? { ...global.modelOptions, ...override.modelOptions }
      : global.modelOptions,
  }
}
