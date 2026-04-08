import { describe, expect, test } from "bun:test"
import type { TranscriptEntry } from "../shared/types"
import {
  allocateSessionBudgets,
  buildBudgetedTranscriptExcerpt,
  generateMergePromptForChats,
  MERGE_FLOOR_PER_SESSION_CHARS,
  MAX_MERGE_TOTAL_CHARS,
} from "./generate-merge-context"
import { MAX_MERGE_SESSIONS } from "../shared/merge-presets"
import type { QuickResponseAdapter, StructuredQuickResponseArgs } from "./quick-response"

const entryBase = () => ({ _id: crypto.randomUUID(), createdAt: Date.now() })

function userPrompt(content: string): TranscriptEntry {
  return { ...entryBase(), kind: "user_prompt" as const, content }
}

function assistantText(text: string): TranscriptEntry {
  return { ...entryBase(), kind: "assistant_text" as const, text }
}

function compactSummary(summary: string): TranscriptEntry {
  return { ...entryBase(), kind: "compact_summary" as const, summary }
}

function resultEntry(result: string, isError = false): TranscriptEntry {
  return { ...entryBase(), kind: "result" as const, result, isError, subtype: isError ? "error" : "success", durationMs: 100 }
}

function contextCleared(): TranscriptEntry {
  return { ...entryBase(), kind: "context_cleared" as const }
}

function statusEntry(status: string): TranscriptEntry {
  return { ...entryBase(), kind: "status" as const, status }
}

// ── allocateSessionBudgets ──────────────────────────────────────────────

describe("allocateSessionBudgets", () => {
  test("gives floor + proportional remainder", () => {
    const sessions = [
      { entries: [userPrompt("short")] },
      { entries: [userPrompt("a".repeat(200)), assistantText("b".repeat(300))] },
    ]

    const budgets = allocateSessionBudgets(sessions)

    expect(budgets).toHaveLength(2)
    // Both should get at least the floor
    expect(budgets[0]!).toBeGreaterThanOrEqual(MERGE_FLOOR_PER_SESSION_CHARS)
    expect(budgets[1]!).toBeGreaterThanOrEqual(MERGE_FLOOR_PER_SESSION_CHARS)
    // Total should not exceed the max
    const total = budgets.reduce((sum, b) => sum + b, 0)
    expect(total).toBeLessThanOrEqual(MAX_MERGE_TOTAL_CHARS)
    // Session with more content should get a larger budget
    expect(budgets[1]!).toBeGreaterThan(budgets[0]!)
  })

  test("skips empty sessions (returns 0 for them)", () => {
    const sessions = [
      { entries: [userPrompt("hello")] },
      { entries: [] },
      { entries: [userPrompt("world"), assistantText("reply")] },
    ]

    const budgets = allocateSessionBudgets(sessions)

    expect(budgets).toHaveLength(3)
    expect(budgets[1]).toBe(0)
    expect(budgets[0]!).toBeGreaterThan(0)
    expect(budgets[2]!).toBeGreaterThan(0)
  })

  test("throws if more than MAX_MERGE_SESSIONS sessions", () => {
    const sessions = Array.from({ length: MAX_MERGE_SESSIONS + 1 }, () => ({
      entries: [userPrompt("x")],
    }))

    expect(() => allocateSessionBudgets(sessions)).toThrow()
  })
})

// ── buildBudgetedTranscriptExcerpt ──────────────────────────────────────

describe("buildBudgetedTranscriptExcerpt", () => {
  test("respects char budget", () => {
    const entries = [
      userPrompt("a".repeat(500)),
      assistantText("b".repeat(500)),
      userPrompt("c".repeat(500)),
    ]

    const budget = 800
    const result = buildBudgetedTranscriptExcerpt(entries, budget)

    expect(result.length).toBeLessThanOrEqual(budget)
  })

  test("prefers entries after context_cleared", () => {
    const entries = [
      userPrompt("old context before clear"),
      assistantText("old response"),
      contextCleared(),
      userPrompt("new context after clear"),
      assistantText("new response"),
    ]

    const result = buildBudgetedTranscriptExcerpt(entries, 5000)

    expect(result).toContain("new context after clear")
    expect(result).toContain("new response")
    expect(result).not.toContain("old context before clear")
    expect(result).not.toContain("old response")
  })

  test("returns fallback message for empty entries", () => {
    const result = buildBudgetedTranscriptExcerpt([], 5000)

    expect(result).toContain("No prior transcript")
  })

  test("filters out non-transcript entry kinds", () => {
    const entries = [
      statusEntry("thinking"),
      userPrompt("visible"),
      statusEntry("more thinking"),
    ]

    const result = buildBudgetedTranscriptExcerpt(entries, 5000)

    expect(result).toContain("visible")
    expect(result).not.toContain("thinking")
  })

  test("includes compact_summary entries", () => {
    const entries = [compactSummary("This is a compact summary of prior work.")]

    const result = buildBudgetedTranscriptExcerpt(entries, 5000)

    expect(result).toContain("compact summary of prior work")
  })

  test("includes result entries with error flag", () => {
    const entries = [resultEntry("something failed", true)]

    const result = buildBudgetedTranscriptExcerpt(entries, 5000)

    expect(result).toContain("something failed")
    expect(result).toContain("error")
  })
})

// ── generateMergePromptForChats ─────────────────────────────────────────

describe("generateMergePromptForChats", () => {
  function createMockAdapter(
    respond?: (args: StructuredQuickResponseArgs<unknown>) => unknown | null,
  ) {
    const capturedArgs: StructuredQuickResponseArgs<unknown>[] = []

    const adapter = {
      generateStructured: async <T>(args: StructuredQuickResponseArgs<T>): Promise<T | null> => {
        capturedArgs.push(args as StructuredQuickResponseArgs<unknown>)
        const result = respond ? respond(args as StructuredQuickResponseArgs<unknown>) : null
        if (result === null) return null
        return args.parse(result) as T | null
      },
    } as QuickResponseAdapter

    return { adapter, getCapturedArgs: () => capturedArgs }
  }

  test("analyzes intent, compacts each source, and labels the final brief by chat id", async () => {
    const { adapter, getCapturedArgs } = createMockAdapter()
    const sessions = [
      { chatId: "abc", entries: [userPrompt("session one context")] },
      { chatId: "def", entries: [userPrompt("session two context")] },
    ]

    const result = await generateMergePromptForChats(
      "Merge these sessions",
      sessions,
      "/tmp/test",
      undefined,
      adapter,
    )

    const args = getCapturedArgs()
    expect(args).toHaveLength(3)
    expect(args[0]!.task).toContain("analysis")
    expect(args[1]!.task).toBe("session context compaction")
    expect(args[2]!.task).toBe("session context compaction")
    expect(args[1]!.prompt).toContain("session one context")
    expect(args[2]!.prompt).toContain("session two context")
    expect(result).toContain("### abc")
    expect(result).toContain("### def")
  })

  test("includes preset hint in the analysis call when provided", async () => {
    const { adapter, getCapturedArgs } = createMockAdapter()
    const sessions = [
      { chatId: "a", entries: [userPrompt("one")] },
      { chatId: "b", entries: [userPrompt("two")] },
    ]

    await generateMergePromptForChats(
      "Compare approaches",
      sessions,
      "/tmp/test",
      "compare_decide",
      adapter,
    )

    const args = getCapturedArgs()
    expect(args[0]!.prompt).toContain("Selected preset: Compare & decide.")
  })

  test("throws for empty sessions", async () => {
    const { adapter } = createMockAdapter()

    await expect(
      generateMergePromptForChats("merge", [], "/tmp/test", undefined, adapter),
    ).rejects.toThrow()
  })

  test("throws for more than MAX_MERGE_SESSIONS sessions", async () => {
    const { adapter } = createMockAdapter()
    const sessions = Array.from({ length: MAX_MERGE_SESSIONS + 1 }, (_, i) => ({
      chatId: `s${i}`,
      entries: [userPrompt(`session ${i}`)],
    }))

    await expect(
      generateMergePromptForChats("merge", sessions, "/tmp/test", undefined, adapter),
    ).rejects.toThrow()
  })

  test("returns a composed fallback brief when adapter calls fail", async () => {
    const { adapter } = createMockAdapter(() => null)
    const sessions = [
      { chatId: "a", entries: [userPrompt("one")] },
      { chatId: "b", entries: [userPrompt("two")] },
    ]

    const result = await generateMergePromptForChats(
      "My merge intent",
      sessions,
      "/tmp/test",
      undefined,
      adapter,
    )

    expect(result).toContain("## Objective\nMy merge intent")
    expect(result).toContain("### a")
    expect(result).toContain("### b")
  })

  test("returns a generated brief on success", async () => {
    const { adapter } = createMockAdapter((args) => {
      if (args.task.includes("analysis")) {
        return {
          compactInstruction: "Keep only the verified findings.",
          nextInstruction: "Resolve the best combined next step.",
        }
      }
      if (args.prompt.includes("User: one")) {
        return { summary: "Summary for source one." }
      }
      return { summary: "Summary for source two." }
    })
    const sessions = [
      { chatId: "a", entries: [userPrompt("one")] },
      { chatId: "b", entries: [userPrompt("two")] },
    ]

    const result = await generateMergePromptForChats(
      "Merge intent",
      sessions,
      "/tmp/test",
      undefined,
      adapter,
    )

    expect(result).toContain("## Objective\nResolve the best combined next step.")
    expect(result).toContain("### a\nSummary for source one.")
    expect(result).toContain("### b\nSummary for source two.")
  })
})
