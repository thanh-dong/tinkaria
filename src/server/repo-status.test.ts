import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readRepoStatus } from "./repo-status"

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeTempRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), "tinkaria-repo-status-"))
  tempDirs.push(dir)
  await execFileAsync("git", ["init", "-b", "main"], { cwd: dir })
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir })
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: dir })
  await writeFile(path.join(dir, "tracked.txt"), "hello\n")
  await execFileAsync("git", ["add", "tracked.txt"], { cwd: dir })
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: dir })
  return dir
}

describe("readRepoStatus", () => {
  test("returns null-ish git metadata for non-repos", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tinkaria-non-repo-"))
    tempDirs.push(dir)

    const status = await readRepoStatus(dir)
    expect(status.isRepo).toBe(false)
    expect(status.branch).toBeNull()
  })

  test("reports branch and dirty counts for repos", async () => {
    const dir = await makeTempRepo()
    await execFileAsync("git", ["checkout", "-b", "feat/status-bar"], { cwd: dir })
    await writeFile(path.join(dir, "tracked.txt"), "changed\n")
    await writeFile(path.join(dir, "staged.txt"), "staged\n")
    await writeFile(path.join(dir, "new.txt"), "new\n")
    await execFileAsync("git", ["add", "staged.txt"], { cwd: dir })

    const status = await readRepoStatus(dir)

    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe("feat/status-bar")
    expect(status.stagedCount).toBe(1)
    expect(status.unstagedCount).toBe(1)
    expect(status.untrackedCount).toBe(1)
  })
})
