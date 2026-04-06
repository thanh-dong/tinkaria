import { describe, expect, test } from "bun:test"
import {
  APP_NAME,
  CLI_COMMAND,
  LOG_PREFIX,
  PACKAGE_NAME,
  RUNTIME_PROFILE_ENV_VAR,
  SDK_CLIENT_APP,
  getDataDir,
  getDataDirDisplay,
  getDataRootName,
  getCliInvocation,
  getRuntimeProfile,
} from "./branding"

describe("runtime profile helpers", () => {
  test("defaults to the prod profile when unset", () => {
    expect(APP_NAME).toBe("Tinkaria")
    expect(CLI_COMMAND).toBe("tinkaria")
    expect(PACKAGE_NAME).toBe("tinkaria")
    expect(LOG_PREFIX).toBe("[tinkaria]")
    expect(SDK_CLIENT_APP).toStartWith("tinkaria/")
    expect(getCliInvocation("--port 4000")).toBe("tinkaria --port 4000")
    expect(getRuntimeProfile({})).toBe("prod")
    expect(getDataRootName({})).toBe(".tinkaria")
    expect(getDataDir("/tmp/home", {})).toBe("/tmp/home/.tinkaria/data")
    expect(getDataDirDisplay({})).toBe("~/.tinkaria/data")
  })

  test("switches to dev paths for the dev profile", () => {
    const env = { [RUNTIME_PROFILE_ENV_VAR]: "dev" }

    expect(getRuntimeProfile(env)).toBe("dev")
    expect(getDataRootName(env)).toBe(".tinkaria-dev")
    expect(getDataDir("/tmp/home", env)).toBe("/tmp/home/.tinkaria-dev/data")
    expect(getDataDirDisplay(env)).toBe("~/.tinkaria-dev/data")
  })

  test("still honors the legacy runtime profile environment variable for compatibility", () => {
    expect(getRuntimeProfile({ KANNA_RUNTIME_PROFILE: "dev" })).toBe("dev")
  })
})
