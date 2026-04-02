import { PROD_SERVER_HOST, PROD_SERVER_PORT } from "./ports"

export const DEFAULT_DESKTOP_ATTACH_HOST = PROD_SERVER_HOST
export const DEFAULT_DESKTOP_ATTACH_URL = `http://${DEFAULT_DESKTOP_ATTACH_HOST}:${PROD_SERVER_PORT}`

export interface DesktopAttachEnv {
  TINKARIA_DESKTOP_ATTACH_URL?: string
  KANNA_DESKTOP_ATTACH_URL?: string
}

export function getDesktopAttachUrl(env: DesktopAttachEnv = process.env as DesktopAttachEnv): string {
  return env.TINKARIA_DESKTOP_ATTACH_URL || env.KANNA_DESKTOP_ATTACH_URL || DEFAULT_DESKTOP_ATTACH_URL
}
