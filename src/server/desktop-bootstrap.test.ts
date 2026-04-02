import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { RUNTIME_PROFILE_ENV_VAR } from "../shared/branding"
import { getDesktopBootstrapFilePath } from "../shared/desktop-bootstrap"
import { writeDesktopBootstrapFile } from "./desktop-bootstrap"

describe("desktop bootstrap writer", () => {
  test("writes the bootstrap file into the prod data root", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "kanna-desktop-bootstrap-"))
    const bootstrap = {
      serverUrl: "http://127.0.0.1:5175",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "prod-token",
    }

    const writtenPath = await writeDesktopBootstrapFile(homeDir, bootstrap, {})

    expect(writtenPath).toBe(getDesktopBootstrapFilePath(homeDir, {}))
    expect(JSON.parse(await readFile(writtenPath, "utf8"))).toEqual(bootstrap)
  })

  test("writes the bootstrap file into the dev data root when requested", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "kanna-desktop-bootstrap-"))
    const bootstrap = {
      serverUrl: "http://127.0.0.1:5175",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "dev-token",
    }
    const env = { [RUNTIME_PROFILE_ENV_VAR]: "dev" }

    const writtenPath = await writeDesktopBootstrapFile(homeDir, bootstrap, env)

    expect(writtenPath).toBe(getDesktopBootstrapFilePath(homeDir, env))
    expect(JSON.parse(await readFile(writtenPath, "utf8"))).toEqual(bootstrap)
  })
})
