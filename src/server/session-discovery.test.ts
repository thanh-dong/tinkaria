import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scanClaudeSessions, scanCodexSessions, resolveTitle, mergeSessions, discoverSessions, parseCliTranscript } from "./session-discovery"
import { EventStore } from "./event-store"
import type { DiscoveredSession } from "../shared/types"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function makeTempDir(prefix = "tinkaria-session-discovery-") {
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
    expect(sessions[0].chatId).toBeNull()
    expect(sessions[0].runtime?.model).toBeUndefined()
  })

  test("extracts readable titles and exchanges from structured message content", async () => {
    const claudeDir = await makeTempDir()
    const sessionFile = join(claudeDir, "structured-content.jsonl")

    await writeFile(sessionFile, [
      JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "text", text: "Fix the flickering sidebar picker" },
            { type: "tool_result", content: { ignored: true } },
          ],
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Patched." }],
        },
      }),
    ].join("\n") + "\n")

    const sessions = await scanClaudeSessions(claudeDir)

    expect(sessions[0].title).toBe("Fix the flickering sidebar picker")
    expect(sessions[0].lastExchange).toEqual({
      question: "Fix the flickering sidebar picker",
      answer: "Patched.",
    })
  }, 15_000)

  test("extracts the last Claude model when assistant usage metadata is present", async () => {
    const claudeDir = await makeTempDir()
    const sessionFile = join(claudeDir, "with-model.jsonl")

    await writeFile(sessionFile, [
      JSON.stringify({ type: "user", message: { content: "hello" } }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "done" }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      }),
    ].join("\n") + "\n")

    const sessions = await scanClaudeSessions(claudeDir)

    expect(sessions[0].runtime?.model).toBe("claude-opus-4-6")
  })

  test("extracts context_usage entries and maps to tokenUsage in runtime", async () => {
    const claudeDir = await makeTempDir()
    const sessionFile = join(claudeDir, "with-context-usage.jsonl")

    await writeFile(sessionFile, [
      JSON.stringify({ type: "user", message: { content: "hello" } }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "done" }],
        },
      }),
      JSON.stringify({
        kind: "context_usage",
        contextUsage: { percentage: 45, totalTokens: 50000, maxTokens: 128000 },
        timestamp: Date.now(),
      }),
    ].join("\n") + "\n")

    const sessions = await scanClaudeSessions(claudeDir)

    expect(sessions[0].runtime?.model).toBe("claude-opus-4-6")
    expect(sessions[0].runtime?.tokenUsage).toEqual({
      totalTokens: 50000,
      contextWindow: 128000,
      estimatedContextPercent: 45,
    })
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

  test("excludes Tinkaria quick-response workflow sessions from Claude history", async () => {
    const claudeDir = await makeTempDir()
    await writeFile(
      join(claudeDir, "fork-helper.jsonl"),
      [
        JSON.stringify({
          type: "user",
          message: {
            content: "Write the first user message for a new independent forked coding session.\n\nFork intent:\nContinue the bug fix.",
          },
        }),
        JSON.stringify({ type: "assistant", message: { content: "## Objective\nContinue the bug fix." } }),
      ].join("\n") + "\n"
    )
    await writeFile(
      join(claudeDir, "real-session.jsonl"),
      [
        JSON.stringify({ type: "user", message: { content: "Investigate the reconnect flicker" } }),
        JSON.stringify({ type: "assistant", message: { content: "Checking the transport." } }),
      ].join("\n") + "\n"
    )

    const sessions = await scanClaudeSessions(claudeDir)

    expect(sessions.map((session) => session.sessionId)).toEqual(["real-session"])
  })
})

describe("scanCodexSessions", () => {
  test("discovers sessions filtered by project path", async () => {
    const sessionsDir = await makeTempDir()
    const dateDir = join(sessionsDir, "2026", "03", "31")
    await mkdir(dateDir, { recursive: true })

    const workspacePath = "/home/user/dev/kanna"

    // Matching session
    const matchFile = join(dateDir, "session-match.jsonl")
    const matchLines = [
      JSON.stringify({ type: "session_meta", payload: { id: "sess-1", cwd: workspacePath, timestamp: Date.now() } }),
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.4" } }),
      JSON.stringify({ type: "user", message: { content: "Fix the tests" } }),
      JSON.stringify({ type: "assistant", message: { content: "Done." } }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { total_tokens: 4312 },
            last_token_usage: { total_tokens: 2160 },
            model_context_window: 272000,
          },
          rate_limits: {
            primary: { used_percent: 13, window_minutes: 300 },
            secondary: { used_percent: 7, window_minutes: 10080 },
          },
        },
      }),
    ]
    await writeFile(matchFile, matchLines.join("\n") + "\n")

    // Non-matching session (different cwd)
    const noMatchFile = join(dateDir, "session-nomatch.jsonl")
    const noMatchLines = [
      JSON.stringify({ type: "session_meta", payload: { id: "sess-2", cwd: "/other/project", timestamp: Date.now() } }),
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
    ]
    await writeFile(noMatchFile, noMatchLines.join("\n") + "\n")

    const sessions = await scanCodexSessions(sessionsDir, workspacePath)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe("sess-1")
    expect(sessions[0].provider).toBe("codex")
    expect(sessions[0].source).toBe("cli")
    expect(sessions[0].lastExchange!.question).toContain("Fix the tests")
    expect(sessions[0].runtime).toEqual({
      model: "gpt-5.4",
      tokenUsage: {
        totalTokens: 4312,
        contextWindow: 272000,
        contextLeft: 267688,
        estimatedContextPercent: 1,
      },
      usageBuckets: [
        { label: "5h", usedPercent: 13 },
        { label: "7d", usedPercent: 7 },
      ],
    })
  })

  test("reads long session_meta lines without truncating JSON", async () => {
    const sessionsDir = await makeTempDir()
    const dateDir = join(sessionsDir, "2026", "04", "06")
    await mkdir(dateDir, { recursive: true })

    const workspacePath = "/home/user/dev/kanna"
    const longInstructions = "x".repeat(12_000)
    const sessionFile = join(dateDir, "session-long-meta.jsonl")

    await writeFile(sessionFile, [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "sess-long",
          cwd: workspacePath,
          timestamp: Date.now(),
          base_instructions: { text: longInstructions },
        },
      }),
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.4" } }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { total_tokens: 8000 },
            last_token_usage: { total_tokens: 52000 },
            model_context_window: 256000,
          },
        },
      }),
    ].join("\n") + "\n")

    const sessions = await scanCodexSessions(sessionsDir, workspacePath)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe("sess-long")
    expect(sessions[0].runtime?.tokenUsage?.estimatedContextPercent).toBe(20)
  })

  test("normalizes ISO session_meta timestamps so sessions stay sortable and visible", async () => {
    const sessionsDir = await makeTempDir()
    const dateDir = join(sessionsDir, "2026", "04", "06")
    await mkdir(dateDir, { recursive: true })

    const workspacePath = "/home/user/dev/kanna"
    const isoTimestamp = "2026-04-06T06:20:46.420Z"
    const sessionFile = join(dateDir, "session-iso-timestamp.jsonl")

    await writeFile(sessionFile, [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "sess-iso",
          cwd: workspacePath,
          timestamp: isoTimestamp,
        },
      }),
      JSON.stringify({ type: "user", message: { content: "Recover the session history bug" } }),
    ].join("\n") + "\n")

    const sessions = await scanCodexSessions(sessionsDir, workspacePath)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].modifiedAt).toBe(Date.parse(isoTimestamp))
  })

  test("returns empty array for nonexistent directory", async () => {
    const sessions = await scanCodexSessions("/nonexistent/path", "/some/path")
    expect(sessions).toEqual([])
  })

  test("excludes Tinkaria quick-response workflow sessions from Codex history", async () => {
    const sessionsDir = await makeTempDir()
    const dateDir = join(sessionsDir, "2026", "04", "07")
    await mkdir(dateDir, { recursive: true })

    const workspacePath = "/home/user/dev/kanna"
    await writeFile(
      join(dateDir, "title-helper.jsonl"),
      [
        JSON.stringify({ type: "session_meta", payload: { id: "title-helper", cwd: workspacePath, timestamp: Date.now() } }),
        JSON.stringify({
          type: "user",
          message: {
            content: "Generate a short, descriptive title (under 30 chars) for a conversation that starts with this message.\n\nhello",
          },
        }),
      ].join("\n") + "\n"
    )
    await writeFile(
      join(dateDir, "real-codex.jsonl"),
      [
        JSON.stringify({ type: "session_meta", payload: { id: "real-codex", cwd: workspacePath, timestamp: Date.now() } }),
        JSON.stringify({ type: "user", message: { content: "Trace the sidebar flicker" } }),
      ].join("\n") + "\n"
    )

    const sessions = await scanCodexSessions(sessionsDir, workspacePath)

    expect(sessions.map((session) => session.sessionId)).toEqual(["real-codex"])
  })
})

describe("resolveTitle", () => {
  test("uses Tinkaria title when source is Tinkaria and title is not default", () => {
    expect(resolveTitle("Fix the bug", "tinkaria", null, 1000)).toBe("Fix the bug")
  })

  test("falls through 'New Chat' title to lastExchange", () => {
    expect(
      resolveTitle("New Chat", "tinkaria", { question: "Why is auth broken?", answer: "Because..." }, 1000)
    ).toBe("Why is auth broken?")
  })

  test("truncates lastExchange.question to 80 chars", () => {
    const longQuestion = "a".repeat(100)
    expect(
      resolveTitle("New Chat", "tinkaria", { question: longQuestion, answer: "" }, 1000)
    ).toHaveLength(80)
  })

  test("falls back to formatted date when no title or exchange", () => {
    const result = resolveTitle("New Chat", "tinkaria", null, 1711900200000)
    expect(result).toContain("Mar")
  })
})

describe("mergeSessions", () => {
  test("deduplicates CLI sessions when Tinkaria has matching sessionToken", () => {
    const cliSessions: DiscoveredSession[] = [
      {
        sessionId: "shared-id",
        provider: "claude",
        source: "cli",
        title: "CLI title",
        lastExchange: { question: "q", answer: "a" },
        modifiedAt: 1000,
        chatId: null,
        runtime: {
          model: "gpt-5.4",
          tokenUsage: {
            totalTokens: 4312,
            estimatedContextPercent: 18,
          },
        },
      },
    ]
    const tinkariaSessions: DiscoveredSession[] = [
      {
        sessionId: "shared-id",
        provider: "claude",
        source: "tinkaria",
        title: "Tinkaria title",
        lastExchange: { question: "q", answer: "a" },
        modifiedAt: 2000,
        chatId: "chat-123",
      },
    ]

    const merged = mergeSessions(cliSessions, tinkariaSessions)

    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe("tinkaria")
    expect(merged[0].chatId).toBe("chat-123")
    expect(merged[0].runtime?.tokenUsage?.estimatedContextPercent).toBe(18)
  })

  test("sorts by modifiedAt descending", () => {
    const sessions: DiscoveredSession[] = [
      { sessionId: "old", provider: "claude", source: "cli", title: "old", lastExchange: null, modifiedAt: 1000, chatId: null },
      { sessionId: "new", provider: "claude", source: "cli", title: "new", lastExchange: null, modifiedAt: 3000, chatId: null },
      { sessionId: "mid", provider: "claude", source: "cli", title: "mid", lastExchange: null, modifiedAt: 2000, chatId: null },
    ]

    const merged = mergeSessions(sessions, [])
    expect(merged.map((s) => s.sessionId)).toEqual(["new", "mid", "old"])
  })
})

describe("discoverSessions", () => {
  test("merges Claude CLI + EventStore chats for a project", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    // Create a Tinkaria chat with sessionToken
    const project = await store.openProject("/home/user/dev/tinkaria", "tinkaria")
    const chat = await store.createChat(project.id)
    await store.setSessionToken(chat.id, "tinkaria-session-token")
    await store.setChatProvider(chat.id, "claude")

    // Create a mock Claude projects dir
    const claudeDir = join(tempDir, "claude-projects")
    await mkdir(claudeDir, { recursive: true })

    // A CLI-only session
    await writeFile(
      join(claudeDir, "cli-only-session.jsonl"),
      JSON.stringify({ type: "user", message: { content: "Hello CLI" } }) + "\n"
    )

    const snapshot = await discoverSessions({
      workspaceId: project.id,
      workspacePath: "/home/user/dev/tinkaria",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: "/nonexistent",
    })

    expect(snapshot.workspaceId).toBe(project.id)
    expect(snapshot.sessions.length).toBeGreaterThanOrEqual(2) // 1 tinkaria + 1 cli
    expect(snapshot.sessions.some((s) => s.source === "tinkaria")).toBe(true)
    expect(snapshot.sessions.some((s) => s.source === "cli")).toBe(true)
  })

  test("returns only CLI sessions when no Tinkaria chats have sessionToken", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    const project = await store.openProject("/home/user/dev/myapp", "myapp")
    // Chat without sessionToken
    await store.createChat(project.id)

    const claudeDir = join(tempDir, "claude-projects")
    await mkdir(claudeDir, { recursive: true })
    await writeFile(
      join(claudeDir, "sess-abc.jsonl"),
      JSON.stringify({ type: "user", message: { content: "Hi" } }) + "\n"
    )

    const snapshot = await discoverSessions({
      workspaceId: project.id,
      workspacePath: "/home/user/dev/myapp",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: null,
    })

    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0].source).toBe("cli")
    expect(snapshot.sessions[0].sessionId).toBe("sess-abc")
  })

  test("deduplicates when Tinkaria sessionToken matches CLI session ID", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    const project = await store.openProject("/home/user/dev/dedup", "dedup")
    const chat = await store.createChat(project.id)
    await store.setSessionToken(chat.id, "shared-session-id")
    await store.setChatProvider(chat.id, "claude")

    const claudeDir = join(tempDir, "claude-projects")
    await mkdir(claudeDir, { recursive: true })
    // CLI session with same ID as Tinkaria sessionToken
    await writeFile(
      join(claudeDir, "shared-session-id.jsonl"),
      JSON.stringify({ type: "user", message: { content: "Shared" } }) + "\n"
    )

    const snapshot = await discoverSessions({
      workspaceId: project.id,
      workspacePath: "/home/user/dev/dedup",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: null,
    })

    // Should be deduped: Tinkaria wins over CLI
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0].source).toBe("tinkaria")
    expect(snapshot.sessions[0].chatId).toBe(chat.id)
  })

  test("returns empty sessions when no dirs and no chats with tokens", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    const project = await store.openProject("/home/user/dev/empty", "empty")

    const snapshot = await discoverSessions({
      workspaceId: project.id,
      workspacePath: "/home/user/dev/empty",
      store,
      claudeProjectDir: null,
      codexSessionsDir: null,
    })

    expect(snapshot.workspaceId).toBe(project.id)
    expect(snapshot.sessions).toEqual([])
  })
})

describe("parseCliTranscript", () => {
  test("extracts user and assistant entries from Claude JSONL", () => {
    const lines = [
      JSON.stringify({ type: "summary", summary: "test" }),
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
      JSON.stringify({ type: "assistant", message: { content: "Hi there" } }),
      JSON.stringify({ type: "result", result: "success" }),
      JSON.stringify({ type: "user", message: { content: "Fix bug" } }),
      JSON.stringify({ type: "assistant", message: { content: "Done" } }),
    ]
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 50)

    expect(entries).toHaveLength(4)
    expect(entries[0].kind).toBe("user_prompt")
    expect(entries[1].kind).toBe("assistant_text")
    expect(entries[2].kind).toBe("user_prompt")
    expect(entries[3].kind).toBe("assistant_text")
  })

  test("respects limit parameter", () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0
        ? JSON.stringify({ type: "user", message: { content: `Q${i}` } })
        : JSON.stringify({ type: "assistant", message: { content: `A${i}` } })
    )
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 10)

    expect(entries).toHaveLength(10)
  })

  test("skips malformed JSON lines gracefully", () => {
    const lines = [
      "not valid json",
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
      "{broken",
      JSON.stringify({ type: "assistant", message: { content: "Hi" } }),
    ]
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 50)

    expect(entries).toHaveLength(2)
    expect(entries[0].kind).toBe("user_prompt")
    expect(entries[1].kind).toBe("assistant_text")
  })

  test("returns empty array for empty content", () => {
    expect(parseCliTranscript("", 50)).toEqual([])
    expect(parseCliTranscript("\n\n", 50)).toEqual([])
  })

  test("assigns unique _id to each entry", () => {
    const lines = [
      JSON.stringify({ type: "user", message: { content: "Q1" } }),
      JSON.stringify({ type: "user", message: { content: "Q2" } }),
    ]
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 50)

    expect(entries[0]._id).not.toBe(entries[1]._id)
  })

  test("populates content field for user entries and text field for assistant entries", () => {
    const lines = [
      JSON.stringify({ type: "user", message: { content: "my question" } }),
      JSON.stringify({ type: "assistant", message: { content: "my answer" } }),
    ]
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 50)

    expect(entries[0].kind).toBe("user_prompt")
    expect((entries[0] as { content: string }).content).toBe("my question")
    expect(entries[1].kind).toBe("assistant_text")
    expect((entries[1] as { text: string }).text).toBe("my answer")
  })
})
