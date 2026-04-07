import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { LOG_PREFIX } from "../shared/branding"

async function listSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return []
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`${LOG_PREFIX} Failed to scan skills dir ${dir}: ${message}`)
    return []
  }
}

export async function scanSkillDirs(projectPath: string, homeDir?: string): Promise<string[]> {
  const home = homeDir ?? homedir()
  const userSkillsDir = join(home, ".claude", "skills")
  const projectSkillsDir = join(projectPath, ".claude", "skills")

  const [userSkills, projectSkills] = await Promise.all([
    listSkillNames(userSkillsDir),
    listSkillNames(projectSkillsDir),
  ])

  const seen = new Set<string>()
  const merged: string[] = []
  for (const name of [...projectSkills, ...userSkills]) {
    if (!seen.has(name)) {
      seen.add(name)
      merged.push(name)
    }
  }
  return merged.sort()
}

interface CacheEntry {
  skills: string[]
  expiresAt: number
}

interface SkillCacheOptions {
  ttlMs?: number
  homeDir?: string
}

export class SkillCache {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly ttlMs: number
  private readonly homeDir: string | undefined

  constructor(options?: SkillCacheOptions) {
    this.ttlMs = options?.ttlMs ?? 30_000
    this.homeDir = options?.homeDir
  }

  async get(projectPath: string): Promise<string[]> {
    const entry = this.cache.get(projectPath)
    if (entry && Date.now() < entry.expiresAt) {
      return entry.skills
    }

    const skills = await scanSkillDirs(projectPath, this.homeDir)
    this.cache.set(projectPath, { skills, expiresAt: Date.now() + this.ttlMs })
    return skills
  }

  invalidate(projectPath?: string): void {
    if (projectPath) {
      this.cache.delete(projectPath)
    } else {
      this.cache.clear()
    }
  }
}
