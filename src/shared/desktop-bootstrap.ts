import { getDataDir, getDataDirDisplay } from "./branding"

export const DESKTOP_BOOTSTRAP_FILE_NAME = "desktop-bootstrap.json"

type RuntimeEnv = Record<string, string | undefined> | undefined

export interface DesktopBootstrap {
  serverUrl: string
  natsUrl: string
  natsWsUrl: string
  authToken: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function getDesktopBootstrapFilePath(homeDir: string, env: RuntimeEnv = undefined) {
  return `${getDataDir(homeDir, env)}/${DESKTOP_BOOTSTRAP_FILE_NAME}`
}

export function getDesktopBootstrapFilePathDisplay(env: RuntimeEnv = undefined) {
  return `${getDataDirDisplay(env)}/${DESKTOP_BOOTSTRAP_FILE_NAME}`
}

export function isDesktopBootstrap(value: unknown): value is DesktopBootstrap {
  return isRecord(value)
    && typeof value.serverUrl === "string"
    && typeof value.natsUrl === "string"
    && typeof value.natsWsUrl === "string"
    && typeof value.authToken === "string"
}

export function normalizeDesktopBootstrap(value: unknown): DesktopBootstrap {
  if (!isDesktopBootstrap(value)) {
    throw new Error("Invalid desktop bootstrap file")
  }

  return {
    serverUrl: value.serverUrl,
    natsUrl: value.natsUrl,
    natsWsUrl: value.natsWsUrl,
    authToken: value.authToken,
  }
}

export function parseDesktopBootstrap(text: string): DesktopBootstrap {
  return normalizeDesktopBootstrap(JSON.parse(text) as unknown)
}

export function serializeDesktopBootstrap(bootstrap: DesktopBootstrap): string {
  return JSON.stringify(bootstrap, null, 2)
}
