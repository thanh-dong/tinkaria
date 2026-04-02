import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"

describe("tauri shell scaffold", () => {
  test("includes the Tauri desktop shell entry points", () => {
    expect(existsSync("src-tauri/tauri.conf.json")).toBe(true)
    expect(existsSync("src-tauri/src/main.rs")).toBe(true)
  })
})
