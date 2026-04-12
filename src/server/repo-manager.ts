import { $ } from "bun"
import { stat } from "node:fs/promises"

const LOG_PREFIX = "[RepoManager]"

export class RepoManager {
  /** Validate path is a git repo, read remote origin + current branch */
  async addLocal(localPath: string): Promise<{ origin: string | null; branch: string | null }> {
    try {
      await stat(localPath)
    } catch (error) {
      throw new Error(`${LOG_PREFIX} Path does not exist: ${localPath}`)
    }

    const gitCheck = await $`git -C ${localPath} rev-parse --git-dir`.quiet()
    if (gitCheck.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Not a git repository: ${localPath}`)
    }

    let origin: string | null = null
    const originResult = await $`git -C ${localPath} remote get-url origin`.quiet().nothrow()
    if (originResult.exitCode === 0) {
      origin = originResult.text().trim() || null
    }

    let branch: string | null = null
    const branchResult = await $`git -C ${localPath} branch --show-current`.quiet()
    if (branchResult.exitCode === 0) {
      branch = branchResult.text().trim() || null
    }

    return { origin, branch }
  }

  /** Clone a remote repo to target path */
  async clone(origin: string, targetPath: string): Promise<void> {
    const result = await $`git clone ${origin} ${targetPath}`.quiet()
    if (result.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Clone failed: ${result.stderr.toString().trim()}`)
    }
  }

  /** Pull latest changes */
  async pull(localPath: string, branch?: string): Promise<string> {
    const args = branch ? [branch] : []
    const result = await $`git -C ${localPath} pull ${args}`.quiet()
    if (result.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Pull failed: ${result.stderr.toString().trim()}`)
    }
    return result.text().trim()
  }

  /** Push changes */
  async push(localPath: string, branch?: string): Promise<string> {
    const args = branch ? [branch] : []
    const result = await $`git -C ${localPath} push ${args}`.quiet()
    if (result.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Push failed: ${result.stderr.toString().trim()}`)
    }
    return result.text().trim()
  }

  /** Get repo status: branch, ahead/behind, dirty flag */
  async status(localPath: string): Promise<{ branch: string; ahead: number; behind: number; dirty: boolean }> {
    const result = await $`git -C ${localPath} status --porcelain=v2 --branch`.quiet()
    if (result.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Status failed: ${result.stderr.toString().trim()}`)
    }

    const output = result.text()
    let branch = ""
    let ahead = 0
    let behind = 0
    let dirty = false

    for (const line of output.split("\n")) {
      if (line.startsWith("# branch.head ")) {
        branch = line.slice("# branch.head ".length).trim()
      } else if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+) -(\d+)/)
        if (match) {
          ahead = parseInt(match[1], 10)
          behind = parseInt(match[2], 10)
        }
      } else if (line.length > 0 && !line.startsWith("#")) {
        dirty = true
      }
    }

    return { branch, ahead, behind, dirty }
  }

  /** No-op — signals intent to remove, does NOT delete files */
  async remove(_localPath: string): Promise<void> {
    // intentional no-op
  }
}
