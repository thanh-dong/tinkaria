import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  ensureTinkariaBrandingPaths,
  getLegacyDataRootName,
  getLegacyKeybindingsFilePath,
  getLegacyDataDir,
} from "./branding-migration"

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await Bun.$`rm -rf ${dir}`.quiet()
  }
})

describe("branding migration", () => {
  test("renames the legacy root into the new tinkaria root when needed", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "tinkaria-branding-"))
    tempDirs.push(homeDir)
    const legacyDataDir = getLegacyDataDir(homeDir, {})
    const legacyRootDir = path.dirname(legacyDataDir)

    await mkdir(legacyDataDir, { recursive: true })
    await Bun.write(path.join(legacyDataDir, "snapshot.json"), "{\"ok\":true}\n")
    await Bun.write(getLegacyKeybindingsFilePath(homeDir, {}), "{}\n")

    const progress: string[] = []
    const result = await ensureTinkariaBrandingPaths(homeDir, {}, (message) => {
      progress.push(message)
    })

    expect(result.migrated).toBe(true)
    expect(result.dataDir).toBe(path.join(homeDir, ".tinkaria", "data"))
    expect(result.keybindingsFilePath).toBe(path.join(homeDir, ".tinkaria", "keybindings.json"))
    expect(existsSync(legacyRootDir)).toBe(false)
    expect(existsSync(path.join(homeDir, ".tinkaria", "data", "snapshot.json"))).toBe(true)
    expect(existsSync(path.join(homeDir, ".tinkaria", "keybindings.json"))).toBe(true)
    expect(progress.some((message) => message.includes(getLegacyDataRootName({})))).toBe(true)
  })

  test("leaves existing tinkaria roots alone", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "tinkaria-branding-"))
    tempDirs.push(homeDir)
    await mkdir(path.join(homeDir, ".tinkaria", "data"), { recursive: true })

    const result = await ensureTinkariaBrandingPaths(homeDir, {})

    expect(result.migrated).toBe(false)
    expect(result.dataDir).toBe(path.join(homeDir, ".tinkaria", "data"))
    expect(result.keybindingsFilePath).toBe(path.join(homeDir, ".tinkaria", "keybindings.json"))
  })
})
