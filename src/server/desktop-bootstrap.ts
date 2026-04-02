import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  getDesktopBootstrapFilePath,
  type DesktopBootstrap,
  serializeDesktopBootstrap,
} from "../shared/desktop-bootstrap"

type RuntimeEnv = Record<string, string | undefined> | undefined

export async function writeDesktopBootstrapFile(
  homeDir: string,
  bootstrap: DesktopBootstrap,
  env: RuntimeEnv = undefined,
) {
  const filePath = getDesktopBootstrapFilePath(homeDir, env)
  await mkdir(path.dirname(filePath), { recursive: true })
  await Bun.write(filePath, `${serializeDesktopBootstrap(bootstrap)}\n`)
  return filePath
}
