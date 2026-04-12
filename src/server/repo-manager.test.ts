import { describe, test, expect, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { $ } from "bun"
import { RepoManager } from "./repo-manager"

const mgr = new RepoManager()

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "repo-mgr-test-"))
  tempDirs.push(dir)
  return dir
}

async function initRepo(dir: string): Promise<void> {
  await $`git -C ${dir} init`.quiet()
  await $`git -C ${dir} config user.email "test@test.com"`.quiet()
  await $`git -C ${dir} config user.name "Test"`.quiet()
}

async function commitFile(dir: string, name = "file.txt", content = "hello"): Promise<void> {
  await writeFile(join(dir, name), content)
  await $`git -C ${dir} add ${name}`.quiet()
  await $`git -C ${dir} commit -m "add ${name}"`.quiet()
}

async function getBranch(dir: string): Promise<string> {
  return (await $`git -C ${dir} branch --show-current`.text()).trim()
}

afterEach(async () => {
  for (const d of tempDirs) {
    await rm(d, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs = []
})

describe("RepoManager", () => {
  test("addLocal — valid repo without remote", async () => {
    const dir = await makeTempDir()
    await initRepo(dir)
    await commitFile(dir)
    const branch = await getBranch(dir)

    const result = await mgr.addLocal(dir)
    expect(result.origin).toBeNull()
    expect(result.branch).toBe(branch)
  })

  test("addLocal — repo with remote", async () => {
    const dir = await makeTempDir()
    await initRepo(dir)
    await commitFile(dir)
    await $`git -C ${dir} remote add origin https://example.com/repo.git`.quiet()

    const result = await mgr.addLocal(dir)
    expect(result.origin).toBe("https://example.com/repo.git")
    expect(result.branch).toBeTruthy()
  })

  test("addLocal — invalid path throws", async () => {
    await expect(mgr.addLocal("/tmp/nonexistent-path-xyz-999")).rejects.toThrow()
  })

  test("addLocal — not a git repo throws", async () => {
    const dir = await makeTempDir()
    await expect(mgr.addLocal(dir)).rejects.toThrow()
  })

  test("status — clean repo", async () => {
    const dir = await makeTempDir()
    await initRepo(dir)
    await commitFile(dir)
    const branch = await getBranch(dir)

    const s = await mgr.status(dir)
    expect(s.branch).toBe(branch)
    expect(s.ahead).toBe(0)
    expect(s.behind).toBe(0)
    expect(s.dirty).toBe(false)
  })

  test("status — dirty repo", async () => {
    const dir = await makeTempDir()
    await initRepo(dir)
    await commitFile(dir)
    await writeFile(join(dir, "file.txt"), "modified")

    const s = await mgr.status(dir)
    expect(s.dirty).toBe(true)
  })

  test("clone — bare repo", async () => {
    const bare = await makeTempDir()
    await $`git init --bare ${bare}`.quiet()

    const target = join(await makeTempDir(), "cloned")
    await mgr.clone(bare, target)

    const check = await $`git -C ${target} rev-parse --git-dir`.quiet()
    expect(check.exitCode).toBe(0)
  })

  test("remove — is a no-op", async () => {
    const dir = await makeTempDir()
    await initRepo(dir)
    await commitFile(dir)

    await mgr.remove(dir)

    // Directory and git repo still exist
    const check = await $`git -C ${dir} rev-parse --git-dir`.quiet()
    expect(check.exitCode).toBe(0)
  })
})
