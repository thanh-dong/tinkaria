import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scanSkillDirs, SkillCache } from "./skill-discovery"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function makeTempDir(prefix = "tinkaria-skill-discovery-") {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function createSkillDir(parent: string, name: string): Promise<void> {
  const skillDir = join(parent, name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, `${name}.md`), `---\nname: ${name}\n---\nSkill content`)
}

describe("scanSkillDirs", () => {
  test("returns skill names from user-level skills dir", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(homeDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "commit")
    await createSkillDir(skillsDir, "review-pr")

    const skills = await scanSkillDirs(projectDir, homeDir)
    expect(skills).toContain("commit")
    expect(skills).toContain("review-pr")
    expect(skills).toHaveLength(2)
  })

  test("returns skill names from project-level skills dir", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(projectDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "c3")
    await createSkillDir(skillsDir, "frontend-design")

    const skills = await scanSkillDirs(projectDir, homeDir)
    expect(skills).toContain("c3")
    expect(skills).toContain("frontend-design")
    expect(skills).toHaveLength(2)
  })

  test("merges user and project skills, deduplicates", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()

    const userSkills = join(homeDir, ".claude", "skills")
    await mkdir(userSkills, { recursive: true })
    await createSkillDir(userSkills, "commit")
    await createSkillDir(userSkills, "shared-skill")

    const projSkills = join(projectDir, ".claude", "skills")
    await mkdir(projSkills, { recursive: true })
    await createSkillDir(projSkills, "c3")
    await createSkillDir(projSkills, "shared-skill")

    const skills = await scanSkillDirs(projectDir, homeDir)
    expect(skills).toContain("commit")
    expect(skills).toContain("c3")
    expect(skills).toContain("shared-skill")
    expect(skills).toHaveLength(3)
  })

  test("returns empty array when no skills dirs exist", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()

    const skills = await scanSkillDirs(projectDir, homeDir)
    expect(skills).toEqual([])
  })

  test("ignores plain files in skills directory", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(homeDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "real-skill")
    await writeFile(join(skillsDir, "not-a-skill.md"), "just a file")

    const skills = await scanSkillDirs(projectDir, homeDir)
    expect(skills).toEqual(["real-skill"])
  })

  test("returns sorted skill names for deterministic output", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(homeDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "zebra")
    await createSkillDir(skillsDir, "alpha")
    await createSkillDir(skillsDir, "middle")

    const skills = await scanSkillDirs(projectDir, homeDir)
    expect(skills).toEqual(["alpha", "middle", "zebra"])
  })
})

describe("SkillCache", () => {
  test("returns discovered skills on first call", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(projectDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "c3")

    const cache = new SkillCache({ ttlMs: 5000, homeDir })
    const skills = await cache.get(projectDir)
    expect(skills).toEqual(["c3"])
  })

  test("returns cached result within TTL", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(projectDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "c3")

    const cache = new SkillCache({ ttlMs: 5000, homeDir })
    const first = await cache.get(projectDir)

    // Add another skill after first scan
    await createSkillDir(skillsDir, "new-skill")
    const second = await cache.get(projectDir)

    // Should return cached (stale) result
    expect(second).toEqual(first)
    expect(second).not.toContain("new-skill")
  })

  test("re-scans after TTL expires", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(projectDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "c3")

    const cache = new SkillCache({ ttlMs: 50, homeDir })
    const first = await cache.get(projectDir)
    expect(first).toEqual(["c3"])

    await createSkillDir(skillsDir, "new-skill")
    await new Promise((r) => setTimeout(r, 60))

    const second = await cache.get(projectDir)
    expect(second).toContain("c3")
    expect(second).toContain("new-skill")
  })

  test("invalidate clears specific project cache", async () => {
    const homeDir = await makeTempDir()
    const projectDir = await makeTempDir()
    const skillsDir = join(projectDir, ".claude", "skills")
    await mkdir(skillsDir, { recursive: true })
    await createSkillDir(skillsDir, "c3")

    const cache = new SkillCache({ ttlMs: 60_000, homeDir })
    await cache.get(projectDir)

    await createSkillDir(skillsDir, "new-skill")
    cache.invalidate(projectDir)

    const refreshed = await cache.get(projectDir)
    expect(refreshed).toContain("new-skill")
  })

  test("invalidate without args clears all caches", async () => {
    const homeDir = await makeTempDir()
    const proj1 = await makeTempDir()
    const proj2 = await makeTempDir()

    for (const dir of [proj1, proj2]) {
      const skillsDir = join(dir, ".claude", "skills")
      await mkdir(skillsDir, { recursive: true })
      await createSkillDir(skillsDir, "skill-a")
    }

    const cache = new SkillCache({ ttlMs: 60_000, homeDir })
    await cache.get(proj1)
    await cache.get(proj2)

    cache.invalidate()

    // Add new skills after invalidation
    await createSkillDir(join(proj1, ".claude", "skills"), "added")
    const refreshed = await cache.get(proj1)
    expect(refreshed).toContain("added")
  })
})
