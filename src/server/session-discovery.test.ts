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

describe("scanCodexSessions", () => {
  test("discovers sessions filtered by project path", async () => {
    const sessionsDir = await makeTempDir()
    const dateDir = join(sessionsDir, "2026", "03", "31")
    await mkdir(dateDir, { recursive: true })

    const projectPath = "/home/user/dev/kanna"

    // Matching session
    const matchFile = join(dateDir, "session-match.jsonl")
    const matchLines = [
      JSON.stringify({ type: "session_meta", payload: { id: "sess-1", cwd: projectPath, timestamp: Date.now() } }),
      JSON.stringify({ type: "user", message: { content: "Fix the tests" } }),
      JSON.stringify({ type: "assistant", message: { content: "Done." } }),
    ]
    await writeFile(matchFile, matchLines.join("\n") + "\n")

    // Non-matching session (different cwd)
    const noMatchFile = join(dateDir, "session-nomatch.jsonl")
    const noMatchLines = [
      JSON.stringify({ type: "session_meta", payload: { id: "sess-2", cwd: "/other/project", timestamp: Date.now() } }),
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
    ]
    await writeFile(noMatchFile, noMatchLines.join("\n") + "\n")

    const sessions = await scanCodexSessions(sessionsDir, projectPath)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe("sess-1")
    expect(sessions[0].provider).toBe("codex")
    expect(sessions[0].source).toBe("cli")
    expect(sessions[0].lastExchange!.question).toContain("Fix the tests")
  })

  test("returns empty array for nonexistent directory", async () => {
    const sessions = await scanCodexSessions("/nonexistent/path", "/some/path")
    expect(sessions).toEqual([])
  })
})

describe("resolveTitle", () => {
  test("uses kanna title when source is kanna and title is not default", () => {
    expect(resolveTitle("Fix the bug", "kanna", null, 1000)).toBe("Fix the bug")
  })

  test("falls through 'New Chat' title to lastExchange", () => {
    expect(
      resolveTitle("New Chat", "kanna", { question: "Why is auth broken?", answer: "Because..." }, 1000)
    ).toBe("Why is auth broken?")
  })

  test("truncates lastExchange.question to 80 chars", () => {
    const longQuestion = "a".repeat(100)
    expect(
      resolveTitle("New Chat", "kanna", { question: longQuestion, answer: "" }, 1000)
    ).toHaveLength(80)
  })

  test("falls back to formatted date when no title or exchange", () => {
    const result = resolveTitle("New Chat", "kanna", null, 1711900200000)
    expect(result).toContain("Mar")
  })
})

describe("mergeSessions", () => {
  test("deduplicates CLI sessions when Kanna has matching sessionToken", () => {
    const cliSessions: DiscoveredSession[] = [
      {
        sessionId: "shared-id",
        provider: "claude",
        source: "cli",
        title: "CLI title",
        lastExchange: { question: "q", answer: "a" },
        modifiedAt: 1000,
        kannaChatId: null,
      },
    ]
    const kannaSessions: DiscoveredSession[] = [
      {
        sessionId: "shared-id",
        provider: "claude",
        source: "kanna",
        title: "Kanna title",
        lastExchange: { question: "q", answer: "a" },
        modifiedAt: 2000,
        kannaChatId: "chat-123",
      },
    ]

    const merged = mergeSessions(cliSessions, kannaSessions)

    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe("kanna")
    expect(merged[0].kannaChatId).toBe("chat-123")
  })

  test("sorts by modifiedAt descending", () => {
    const sessions: DiscoveredSession[] = [
      { sessionId: "old", provider: "claude", source: "cli", title: "old", lastExchange: null, modifiedAt: 1000, kannaChatId: null },
      { sessionId: "new", provider: "claude", source: "cli", title: "new", lastExchange: null, modifiedAt: 3000, kannaChatId: null },
      { sessionId: "mid", provider: "claude", source: "cli", title: "mid", lastExchange: null, modifiedAt: 2000, kannaChatId: null },
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

    // Create a Kanna chat with sessionToken
    const project = await store.openProject("/home/user/dev/kanna", "kanna")
    const chat = await store.createChat(project.id)
    await store.setSessionToken(chat.id, "kanna-session-token")
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
      projectId: project.id,
      projectPath: "/home/user/dev/kanna",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: "/nonexistent",
    })

    expect(snapshot.projectId).toBe(project.id)
    expect(snapshot.sessions.length).toBeGreaterThanOrEqual(2) // 1 kanna + 1 cli
    expect(snapshot.sessions.some((s) => s.source === "kanna")).toBe(true)
    expect(snapshot.sessions.some((s) => s.source === "cli")).toBe(true)
  })

  test("returns only CLI sessions when no Kanna chats have sessionToken", async () => {
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
      projectId: project.id,
      projectPath: "/home/user/dev/myapp",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: null,
    })

    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0].source).toBe("cli")
    expect(snapshot.sessions[0].sessionId).toBe("sess-abc")
  })

  test("deduplicates when Kanna sessionToken matches CLI session ID", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    const project = await store.openProject("/home/user/dev/dedup", "dedup")
    const chat = await store.createChat(project.id)
    await store.setSessionToken(chat.id, "shared-session-id")
    await store.setChatProvider(chat.id, "claude")

    const claudeDir = join(tempDir, "claude-projects")
    await mkdir(claudeDir, { recursive: true })
    // CLI session with same ID as Kanna sessionToken
    await writeFile(
      join(claudeDir, "shared-session-id.jsonl"),
      JSON.stringify({ type: "user", message: { content: "Shared" } }) + "\n"
    )

    const snapshot = await discoverSessions({
      projectId: project.id,
      projectPath: "/home/user/dev/dedup",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: null,
    })

    // Should be deduped: Kanna wins over CLI
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0].source).toBe("kanna")
    expect(snapshot.sessions[0].kannaChatId).toBe(chat.id)
  })

  test("returns empty sessions when no dirs and no chats with tokens", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    const project = await store.openProject("/home/user/dev/empty", "empty")

    const snapshot = await discoverSessions({
      projectId: project.id,
      projectPath: "/home/user/dev/empty",
      store,
      claudeProjectDir: null,
      codexSessionsDir: null,
    })

    expect(snapshot.projectId).toBe(project.id)
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
