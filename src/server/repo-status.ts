import { spawn } from "node:child_process"
import type { CurrentRepoStatusSnapshot } from "../shared/types"

function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on("error", (error) => {
      resolve({ stdout, stderr: error.message, exitCode: 1 })
    })
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })
  })
}

function parseBranchStatus(stdout: string): Pick<CurrentRepoStatusSnapshot, "branch" | "ahead" | "behind"> {
  const lines = stdout.split("\n")
  const header = lines.find((line) => line.startsWith("## ")) ?? ""
  const branchMatch = /^## ([^.\s]+)(?:\.\.\.[^\s]+)?(?: .*)?$/.exec(header)
  const aheadMatch = /ahead (\d+)/.exec(header)
  const behindMatch = /behind (\d+)/.exec(header)

  return {
    branch: branchMatch ? branchMatch[1] : null,
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1], 10) : 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1], 10) : 0,
  }
}

function parseDirtyCounts(stdout: string): Pick<CurrentRepoStatusSnapshot, "stagedCount" | "unstagedCount" | "untrackedCount"> {
  let stagedCount = 0
  let unstagedCount = 0
  let untrackedCount = 0

  for (const line of stdout.split("\n")) {
    if (!line || line.startsWith("## ")) continue
    if (line.startsWith("??")) {
      untrackedCount += 1
      continue
    }
    if (line[0] && line[0] !== " ") stagedCount += 1
    if (line[1] && line[1] !== " ") unstagedCount += 1
  }

  return { stagedCount, unstagedCount, untrackedCount }
}

export async function readRepoStatus(localPath: string): Promise<CurrentRepoStatusSnapshot> {
  const result = await runGit(["status", "--porcelain=v1", "--branch"], localPath)
  if (result.exitCode !== 0) {
    return {
      localPath,
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      ahead: 0,
      behind: 0,
      isRepo: false,
    }
  }

  return {
    localPath,
    ...parseBranchStatus(result.stdout),
    ...parseDirtyCounts(result.stdout),
    isRepo: true,
  }
}
