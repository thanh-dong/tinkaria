import { describe, expect, test } from "bun:test"
import { generateTitleForChat } from "./generate-title"
import { generateForkPromptForChat } from "./generate-fork-context"
import { QuickResponseAdapter } from "./quick-response"

describe("QuickResponseAdapter", () => {
  test("returns the Claude structured result when it validates", async () => {
    const adapter = new QuickResponseAdapter({
      runClaudeStructured: async () => ({ title: "Claude title" }),
      runCodexStructured: async () => ({ title: "Codex title" }),
    })

    const result = await adapter.generateStructured({
      cwd: "/tmp/project",
      task: "title generation",
      prompt: "Generate a title",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      parse: (value) => {
        const output = value && typeof value === "object" ? value as { title?: unknown } : {}
        return typeof output.title === "string" ? output.title : null
      },
    })

    expect(result).toBe("Claude title")
  })

  test("falls back to Codex when Claude fails validation", async () => {
    const adapter = new QuickResponseAdapter({
      runClaudeStructured: async () => ({ bad: true }),
      runCodexStructured: async () => ({ title: "Codex title" }),
    })

    const result = await adapter.generateStructured({
      cwd: "/tmp/project",
      task: "title generation",
      prompt: "Generate a title",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      parse: (value) => {
        const output = value && typeof value === "object" ? value as { title?: unknown } : {}
        return typeof output.title === "string" ? output.title : null
      },
    })

    expect(result).toBe("Codex title")
  })

  test("falls back to Codex when Claude throws", async () => {
    const adapter = new QuickResponseAdapter({
      runClaudeStructured: async () => {
        throw new Error("Not authenticated")
      },
      runCodexStructured: async () => ({ title: "Codex title" }),
    })

    const result = await adapter.generateStructured({
      cwd: "/tmp/project",
      task: "title generation",
      prompt: "Generate a title",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      parse: (value) => {
        const output = value && typeof value === "object" ? value as { title?: unknown } : {}
        return typeof output.title === "string" ? output.title : null
      },
    })

    expect(result).toBe("Codex title")
  })
})

describe("generateTitleForChat", () => {
  test("sanitizes generated titles", async () => {
    const title = await generateTitleForChat(
      "hello",
      "/tmp/project",
      new QuickResponseAdapter({
        runClaudeStructured: async () => ({ title: "   Example\nTitle   " }),
      })
    )

    expect(title).toBe("Example Title")
  })

  test("rejects invalid generated titles", async () => {
    const title = await generateTitleForChat(
      "hello",
      "/tmp/project",
      new QuickResponseAdapter({
        runClaudeStructured: async () => ({ title: "   " }),
        runCodexStructured: async () => ({ title: "New Chat" }),
      })
    )

    expect(title).toBeNull()
  })
})

describe("generateForkPromptForChat", () => {
  test("builds a dedicated-session brief from analyzed intent and compacted context", async () => {
    const prompt = await generateForkPromptForChat(
      "Focus on the auth race fix",
      [],
      "/tmp/project",
      undefined,
      new QuickResponseAdapter({
        runClaudeStructured: async (args) => {
          if (args.task.includes("analysis")) {
            return {
              compactInstruction: "Keep the auth-race evidence only.",
              nextInstruction: "Fix the auth race.",
            }
          }
          return {
            summary: "## Relevant Context\nKeep the existing API.",
          }
        },
      }),
    )

    expect(prompt).toBe([
      "## Objective",
      "Fix the auth race.",
      "",
      "## Relevant Context",
      "## Relevant Context",
      "Keep the existing API.",
      "",
      "## Constraints",
      "Preserve proven constraints from the context above. Call out contradictions or missing evidence before making risky changes.",
      "",
      "## Next Step",
      "Start directly on the objective using the compacted context above.",
    ].join("\n"))
  })

  test("falls back to a composed brief when structured output is invalid", async () => {
    const prompt = await generateForkPromptForChat(
      "   Continue the mobile keyboard fix   ",
      [],
      "/tmp/project",
      undefined,
      new QuickResponseAdapter({
        runClaudeStructured: async () => ({ nope: true }),
        runCodexStructured: async () => ({ prompt: "   " }),
      }),
    )

    expect(prompt).toContain("## Objective\nContinue the mobile keyboard fix")
    expect(prompt).toContain("## Relevant Context\nNo prior transcript context was available.")
  })

  test("includes preset guidance in the analysis prompt", async () => {
    let capturedPrompt = ""
    await generateForkPromptForChat(
      "Focus on an alternative design",
      [],
      "/tmp/project",
      "alternative_approach",
      new QuickResponseAdapter({
        runClaudeStructured: async (args) => {
          if (args.task.includes("analysis")) {
            capturedPrompt = args.prompt
            return {
              compactInstruction: "Preserve only the key constraints.",
              nextInstruction: "Explore the alternative.",
            }
          }
          return { summary: "## Relevant Context\nAlternative-ready constraints." }
        },
      }),
    )

    expect(capturedPrompt).toContain("Selected preset: Alternative approach.")
    expect(capturedPrompt).toContain("exploring a different solution path")
  })
})
