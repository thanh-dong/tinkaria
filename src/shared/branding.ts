export const APP_NAME = "Tinkaria"
export const CLI_COMMAND = "tinkaria"
export const DATA_ROOT_NAME = ".tinkaria"
export const DEV_DATA_ROOT_NAME = ".tinkaria-dev"
export const PACKAGE_NAME = "tinkaria"
export const RUNTIME_PROFILE_ENV_VAR = "TINKARIA_RUNTIME_PROFILE"
export const LEGACY_RUNTIME_PROFILE_ENV_VAR = "KANNA_RUNTIME_PROFILE"
// Read version from package.json — JSON import works in both Bun and Vite
import pkg from "../../package.json"
export const SDK_CLIENT_APP = `tinkaria/${pkg.version}`
export const LOG_PREFIX = "[tinkaria]"
export const DEFAULT_NEW_PROJECT_ROOT = `~/${APP_NAME}`

export type RuntimeProfile = "dev" | "prod"

type RuntimeEnv = Record<string, string | undefined> | undefined

function getRuntimeEnv(): RuntimeEnv {
  const candidate = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>
    }
  }
  return candidate.process?.env
}

export function getRuntimeProfile(env: RuntimeEnv = getRuntimeEnv()): RuntimeProfile {
  const profile = env?.[RUNTIME_PROFILE_ENV_VAR] ?? env?.[LEGACY_RUNTIME_PROFILE_ENV_VAR]
  return profile?.trim().toLowerCase() === "dev" ? "dev" : "prod"
}

export function getDataRootName(env: RuntimeEnv = getRuntimeEnv()) {
  return getRuntimeProfile(env) === "dev" ? DEV_DATA_ROOT_NAME : DATA_ROOT_NAME
}

export function getDataRootDir(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${homeDir}/${getDataRootName(env)}`
}

export function getDataRootDirDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `~/${getDataRootName(env)}`
}

export function getDataDir(homeDir: string, env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDir(homeDir, env)}/data`
}

export function getDataDirDisplay(env: RuntimeEnv = getRuntimeEnv()) {
  return `${getDataRootDirDisplay(env)}/data`
}

export function getCliInvocation(arg?: string) {
  return arg ? `${CLI_COMMAND} ${arg}` : CLI_COMMAND
}
