import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scanClaudeSessions } from "./session-discovery"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function makeTempDir(prefix = "kanna-session-discovery-") {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe("scanClaudeSessions", () => {
  test("discovers .jsonl files and extracts metadata", async () => {
    const claudeDir = await makeTempDir()
    const sessionId = "abc12345-6789-0def-ghij-klmnopqrstuv"
    const sessionFile = join(claudeDir, `${sessionId}.jsonl`)

    const lines = [
      JSON.stringify({ type: "summary", summary: "" }),
      JSON.stringify({ type: "user", message: { content: "Fix the auth bug in login.ts" } }),
      JSON.stringify({ type: "assistant", message: { content: "I'll fix the auth bug." } }),
      JSON.stringify({ type: "user", message: { content: "Now add tests" } }),
      JSON.stringify({ type: "assistant", message: { content: "Here are the tests." } }),
    ]
    await writeFile(sessionFile, lines.join("\n") + "\n")
    const now = new Date()
    await utimes(sessionFile, now, now)

    const sessions = await scanClaudeSessions(claudeDir)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe(sessionId)
    expect(sessions[0].provider).toBe("claude")
    expect(sessions[0].source).toBe("cli")
    expect(sessions[0].lastExchange).not.toBeNull()
    expect(sessions[0].lastExchange!.question).toContain("add tests")
    expect(sessions[0].lastExchange!.answer).toContain("tests")
    expect(sessions[0].kannaChatId).toBeNull()
  })

  test("skips directories with same UUID names", async () => {
    const claudeDir = await makeTempDir()
    const sessionId = "abc12345-6789-0def-ghij-klmnopqrstuv"

    await writeFile(
      join(claudeDir, `${sessionId}.jsonl`),
      JSON.stringify({ type: "user", message: { content: "hello" } }) + "\n"
    )
    await mkdir(join(claudeDir, sessionId, "subagents"), { recursive: true })

    const sessions = await scanClaudeSessions(claudeDir)
    expect(sessions).toHaveLength(1)
  })

  test("returns empty array for nonexistent directory", async () => {
    const sessions = await scanClaudeSessions("/nonexistent/path")
    expect(sessions).toEqual([])
  })
})
