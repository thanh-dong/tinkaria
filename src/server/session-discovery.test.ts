import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { findSessionFile, inspectSessionRuntime } from "./session-discovery"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})


describe("findSessionFile", () => {
  test("returns null when claude session file does not exist", async () => {
    const result = await findSessionFile("nonexistent-session-id", "claude", "/nonexistent/path")
    expect(result).toBeNull()
  })

  test("returns null when codex sessions directory does not exist", async () => {
    const result = await findSessionFile("nonexistent-session-id", "codex", "/nonexistent/path")
    expect(result).toBeNull()
  })

  test("finds a Claude session file at the encoded project dir path", async () => {
    const sessionId = "find-claude-test-session"
    const workspacePath = `/tmp/find-claude-test-${Date.now()}`

    // encodeClaudeProjectDir uses homedir() which Bun doesn't override via process.env.HOME
    // so we write directly to the real encoded path
    const claudeProjectDir = join(homedir(), ".claude", "projects", workspacePath.replace(/\//g, "-"))
    await mkdir(claudeProjectDir, { recursive: true })
    tempDirs.push(claudeProjectDir)

    const sessionFile = join(claudeProjectDir, `${sessionId}.jsonl`)
    await writeFile(sessionFile, JSON.stringify({ type: "user", message: { content: "hello" } }) + "\n")

    const result = await findSessionFile(sessionId, "claude", workspacePath)
    expect(result).toBe(sessionFile)
  })
})

describe("inspectSessionRuntime", () => {
  test("returns null when session file does not exist", async () => {
    const result = await inspectSessionRuntime("nonexistent-session-id", "claude", "/nonexistent/path")
    expect(result).toBeNull()
  })

  test("extracts Claude runtime from session file", async () => {
    const sessionId = `inspect-claude-${Date.now()}`
    const workspacePath = `/tmp/inspect-claude-test-${Date.now()}`

    const claudeProjectDir = join(homedir(), ".claude", "projects", workspacePath.replace(/\//g, "-"))
    await mkdir(claudeProjectDir, { recursive: true })
    tempDirs.push(claudeProjectDir)

    await writeFile(join(claudeProjectDir, `${sessionId}.jsonl`), [
      JSON.stringify({ type: "user", message: { content: "hello" } }),
      JSON.stringify({
        type: "assistant",
        message: { model: "claude-opus-4-6", content: [{ type: "text", text: "hi" }] },
      }),
      JSON.stringify({
        kind: "context_usage",
        contextUsage: { percentage: 45, totalTokens: 50000, maxTokens: 128000 },
      }),
    ].join("\n") + "\n")

    const runtime = await inspectSessionRuntime(sessionId, "claude", workspacePath)
    expect(runtime).not.toBeNull()
    expect(runtime?.model).toBe("claude-opus-4-6")
    expect(runtime?.tokenUsage?.totalTokens).toBe(50000)
  })

  test("extracts Codex runtime from session file", async () => {
    const sessionId = `inspect-codex-${Date.now()}`
    const codexSessionsDir = join(homedir(), ".codex", "sessions")
    await mkdir(codexSessionsDir, { recursive: true })

    const sessionFile = join(codexSessionsDir, `${sessionId}.jsonl`)
    await writeFile(sessionFile, [
      JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: "/some/path" } }),
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.4" } }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { total_tokens: 4312 },
            last_token_usage: { total_tokens: 2160 },
            model_context_window: 272000,
          },
        },
      }),
    ].join("\n") + "\n")
    tempDirs.push(sessionFile)

    const filePath = await findSessionFile(sessionId, "codex", "/some/path")
    expect(filePath).not.toBeNull()

    const runtime = await inspectSessionRuntime(sessionId, "codex", "/some/path")
    expect(runtime).not.toBeNull()
    expect(runtime?.model).toBe("gpt-5.4")
    expect(runtime?.tokenUsage?.totalTokens).toBe(4312)
  })
})
