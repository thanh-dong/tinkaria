// src/server/transcript-search.test.ts
import { describe, expect, test } from "bun:test"
import { TranscriptSearchIndex } from "./transcript-search"
import type { TranscriptEntry } from "../shared/types"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

describe("TranscriptSearchIndex", () => {
  test("indexes user_prompt entries and searches", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: "implement auth middleware with JWT tokens" }))
    index.addEntry("chat-2", timestamped({ kind: "user_prompt", content: "fix CSS styling on sidebar" }))

    const results = index.search("auth middleware")
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].chatId).toBe("chat-1")
    expect(results[0].kind).toBe("user_prompt")
  })

  test("indexes assistant_text entries", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "assistant_text", text: "I created the users table with email and password_hash columns" }))

    const results = index.search("users table")
    expect(results.length).toBe(1)
    expect(results[0].chatId).toBe("chat-1")
  })

  test("indexes tool_call entries with file paths", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "edit_file",
        toolName: "Edit",
        toolId: "tool-1",
        input: { filePath: "/src/server/auth.ts", oldString: "a", newString: "b" },
      },
    } as Omit<TranscriptEntry, "_id" | "createdAt">))

    const results = index.search("auth.ts")
    expect(results.length).toBe(1)
  })

  test("indexes tool_call entries with bash commands", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "bash",
        toolName: "Bash",
        toolId: "tool-2",
        input: { command: "bun test src/server/auth.test.ts" },
      },
    } as Omit<TranscriptEntry, "_id" | "createdAt">))

    const results = index.search("bun test auth")
    expect(results.length).toBe(1)
  })

  test("indexes tool_call entries with grep patterns", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "grep",
        toolName: "Grep",
        toolId: "tool-3",
        input: { pattern: "handleAuth", outputMode: "content" },
      },
    } as Omit<TranscriptEntry, "_id" | "createdAt">))

    const results = index.search("handleAuth")
    expect(results.length).toBe(1)
  })

  test("indexes tool_result entries", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_result",
      toolId: "tool-1",
      content: "File written successfully to /src/server/auth.ts",
    }))

    const results = index.search("auth.ts written")
    expect(results.length).toBe(1)
  })

  test("indexes tool_result with non-string content via JSON", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_result",
      toolId: "tool-1",
      content: { files: ["auth.ts", "middleware.ts"], count: 2 },
    }))

    const results = index.search("auth.ts middleware")
    expect(results.length).toBe(1)
  })

  test("returns results with score and fragment", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: "implement error handling for database connections" }))

    const results = index.search("error handling")
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0].fragment.length).toBeGreaterThan(0)
  })

  test("returns empty for no matches", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: "hello world" }))

    const results = index.search("nonexistent term here")
    expect(results).toEqual([])
  })

  test("respects limit", () => {
    const index = new TranscriptSearchIndex()
    for (let i = 0; i < 20; i++) {
      index.addEntry(`chat-${i}`, timestamped({ kind: "user_prompt", content: `testing search feature ${i}` }))
    }

    const results = index.search("testing search", 5)
    expect(results.length).toBe(5)
  })

  test("skips non-indexable entry kinds", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({ kind: "status", status: "running" }))
    index.addEntry("chat-1", timestamped({ kind: "context_cleared" }))
    index.addEntry("chat-1", timestamped({ kind: "interrupted" }))
    index.addEntry("chat-1", timestamped({ kind: "compact_boundary" }))

    expect(index.size).toBe(0)
  })

  test("fragment is truncated to 300 chars", () => {
    const index = new TranscriptSearchIndex()
    const longContent = "database ".repeat(100) // 900 chars
    index.addEntry("chat-1", timestamped({ kind: "user_prompt", content: longContent }))

    const results = index.search("database")
    expect(results[0].fragment.length).toBeLessThanOrEqual(300)
  })

  test("tool_result content is truncated to 500 chars before indexing", () => {
    const index = new TranscriptSearchIndex()
    // "filler " is 7 chars; 72 repeats = 504 chars, pushing ZZZMARKER past the 500 boundary
    const padding = "filler ".repeat(72)
    const content = padding + "ZZZMARKER"
    expect(content.indexOf("ZZZMARKER")).toBeGreaterThan(500)

    index.addEntry("chat-1", timestamped({
      kind: "tool_result",
      toolId: "tool-1",
      content,
    }))

    // ZZZMARKER sits beyond 500 chars and must not be indexed
    const results = index.search("ZZZMARKER")
    expect(results).toEqual([])
  })

  test("tool_result content within 500 chars is still searchable", () => {
    const index = new TranscriptSearchIndex()
    index.addEntry("chat-1", timestamped({
      kind: "tool_result",
      toolId: "tool-1",
      content: "File written successfully to /src/server/auth.ts",
    }))

    const results = index.search("auth.ts written")
    expect(results.length).toBe(1)
  })

  test("timestamp is ISO string derived from createdAt", () => {
    const index = new TranscriptSearchIndex()
    const now = Date.now()
    const entry = { _id: "fixed-id", createdAt: now, kind: "user_prompt" as const, content: "test timestamp" } as TranscriptEntry
    index.addEntry("chat-1", entry)

    const results = index.search("timestamp")
    expect(results[0].timestamp).toBe(new Date(now).toISOString())
  })
})
