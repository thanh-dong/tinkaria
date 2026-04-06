import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import {
  DATA_ROOT_NAME,
  DEV_DATA_ROOT_NAME,
  getDataDir,
  getDataRootDir,
  getRuntimeProfile,
  LOG_PREFIX,
} from "../shared/branding"

type RuntimeEnv = Record<string, string | undefined> | undefined

const LEGACY_DATA_ROOT_NAME = ".kanna"
const LEGACY_DEV_DATA_ROOT_NAME = ".kanna-dev"

export function getLegacyDataRootName(env: RuntimeEnv = undefined) {
  return getRuntimeProfile(env) === "dev" ? LEGACY_DEV_DATA_ROOT_NAME : LEGACY_DATA_ROOT_NAME
}

export function getLegacyDataRootDir(homeDir: string, env: RuntimeEnv = undefined) {
  return `${homeDir}/${getLegacyDataRootName(env)}`
}

export function getLegacyDataDir(homeDir: string, env: RuntimeEnv = undefined) {
  return `${getLegacyDataRootDir(homeDir, env)}/data`
}

export async function ensureTinkariaBrandingPaths(
  homeDir: string,
  env: RuntimeEnv = undefined,
  onProgress?: (message: string) => void,
) {
  const dataRootDir = getDataRootDir(homeDir, env)
  const legacyDataRootDir = getLegacyDataRootDir(homeDir, env)
  let migrated = false

  if (!existsSync(dataRootDir) && existsSync(legacyDataRootDir)) {
    onProgress?.(
      `${LOG_PREFIX} migrating local data root from ${getLegacyDataRootName(env)} to ${getRuntimeProfile(env) === "dev" ? DEV_DATA_ROOT_NAME : DATA_ROOT_NAME}`,
    )
    await rename(legacyDataRootDir, dataRootDir)
    migrated = true
  }

  return {
    migrated,
    dataDir: getDataDir(homeDir, env),
  }
}
