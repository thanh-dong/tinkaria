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
  test("returns a sanitized generated fork prompt", async () => {
    const prompt = await generateForkPromptForChat(
      "Focus on the auth race fix",
      [],
      "/tmp/project",
      undefined,
      new QuickResponseAdapter({
        runClaudeStructured: async () => ({
          prompt: "  ## Objective\nFix the auth race.\n\n## Constraints\nKeep the existing API.  ",
        }),
      }),
    )

    expect(prompt).toBe("## Objective\nFix the auth race.\n\n## Constraints\nKeep the existing API.")
  })

  test("falls back to the normalized fork intent when structured output is invalid", async () => {
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

    expect(prompt).toBe("Continue the mobile keyboard fix")
  })

  test("includes preset guidance in the generation prompt", async () => {
    let capturedPrompt = ""
    await generateForkPromptForChat(
      "Focus on an alternative design",
      [],
      "/tmp/project",
      "alternative_approach",
      new QuickResponseAdapter({
        runClaudeStructured: async (args) => {
          capturedPrompt = args.prompt
          return { prompt: "## Objective\nExplore the alternative." }
        },
      }),
    )

    expect(capturedPrompt).toContain("Selected fork preset: Alternative approach.")
    expect(capturedPrompt).toContain("exploring a different solution path")
  })
})
