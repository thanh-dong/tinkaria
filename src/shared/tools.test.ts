import { describe, expect, test } from "bun:test"
import { hydrateToolResult, normalizeToolCall } from "./tools"
import { isReadFileImageResult } from "./types"

describe("normalizeToolCall", () => {
  test("maps AskUserQuestion input to typed questions", () => {
    const tool = normalizeToolCall({
      toolName: "AskUserQuestion",
      toolId: "tool-1",
      input: {
        questions: [
          {
            question: "Which runtime?",
            header: "Runtime",
            options: [{ label: "Codex", description: "Use Codex" }],
          },
        ],
      },
    })

    expect(tool.toolKind).toBe("ask_user_question")
    if (tool.toolKind !== "ask_user_question") throw new Error("unexpected tool kind")
    expect(tool.input.questions[0]?.question).toBe("Which runtime?")
  })

  test("maps Bash snake_case input to camelCase", () => {
    const tool = normalizeToolCall({
      toolName: "Bash",
      toolId: "tool-2",
      input: {
        command: "pwd",
        timeout: 5000,
        run_in_background: true,
      },
    })

    expect(tool.toolKind).toBe("bash")
    if (tool.toolKind !== "bash") throw new Error("unexpected tool kind")
    expect(tool.input.timeoutMs).toBe(5000)
    expect(tool.input.runInBackground).toBe(true)
  })

  test("maps unknown MCP tools to mcp_generic", () => {
    const tool = normalizeToolCall({
      toolName: "mcp__sentry__search_issues",
      toolId: "tool-3",
      input: { query: "regression" },
    })

    expect(tool.toolKind).toBe("mcp_generic")
    if (tool.toolKind !== "mcp_generic") throw new Error("unexpected tool kind")
    expect(tool.input.server).toBe("sentry")
    expect(tool.input.tool).toBe("search_issues")
  })

  test("maps present_content input to a typed content payload", () => {
    const tool = normalizeToolCall({
      toolName: "present_content",
      toolId: "tool-4",
      input: {
        title: "System Design",
        kind: "diagram",
        format: "mermaid",
        source: "graph TD\nA-->B",
        summary: "Current flow",
        collapsed: true,
      },
    })

    expect(tool.toolKind).toBe("present_content")
    if (tool.toolKind !== "present_content") throw new Error("unexpected tool kind")
    expect(tool.input.title).toBe("System Design")
    expect(tool.input.format).toBe("mermaid")
  })

})

describe("hydrateToolResult", () => {
  test("hydrates AskUserQuestion answers", () => {
    const tool = normalizeToolCall({
      toolName: "AskUserQuestion",
      toolId: "tool-1",
      input: { questions: [] },
    })

    const result = hydrateToolResult(tool, JSON.stringify({ answers: { runtime: "codex" } }))
    expect(result).toEqual({ answers: { runtime: ["codex"] } })
  })

  test("hydrates AskUserQuestion multi-select answers", () => {
    const tool = normalizeToolCall({
      toolName: "AskUserQuestion",
      toolId: "tool-1",
      input: { questions: [] },
    })

    const result = hydrateToolResult(tool, JSON.stringify({ answers: { runtime: ["bun", "node"] } }))
    expect(result).toEqual({ answers: { runtime: ["bun", "node"] } })
  })

  test("hydrates ExitPlanMode decisions", () => {
    const tool = normalizeToolCall({
      toolName: "ExitPlanMode",
      toolId: "tool-2",
      input: { plan: "Do the thing" },
    })

    const result = hydrateToolResult(tool, { confirmed: true, clearContext: true })
    expect(result).toEqual({ confirmed: true, clearContext: true, message: undefined })
  })

  test("hydrates Read file text results", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-3",
      input: { file_path: "/tmp/example.ts" },
    })

    expect(hydrateToolResult(tool, "line 1\nline 2")).toBe("line 1\nline 2")
  })

  test("hydrates present_content structured results", () => {
    const tool = normalizeToolCall({
      toolName: "present_content",
      toolId: "tool-4",
      input: {
        title: "Snippet",
        kind: "code",
        format: "typescript",
        source: "const x = 1",
      },
    })

    const result = hydrateToolResult(tool, {
      title: "Snippet",
      kind: "code",
      format: "typescript",
      source: "const x = 1",
      summary: "Context",
      collapsed: false,
    })

    expect(result).toEqual({
      accepted: true,
      title: "Snippet",
      kind: "code",
      format: "typescript",
      source: "const x = 1",
      summary: "Context",
      collapsed: false,
    })
  })


  test("hydrates read_file image content blocks into ReadFileImageResult", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-img-1",
      input: { file_path: "/tmp/screenshot.png" },
    })

    const raw = [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
    ]

    const result = hydrateToolResult(tool, raw)
    expect(isReadFileImageResult(result)).toBe(true)
    if (!isReadFileImageResult(result)) throw new Error("expected image result")
    expect(result.images).toHaveLength(1)
    expect(result.images[0].mediaType).toBe("image/png")
    expect(result.images[0].data).toBe("iVBORw0KGgo=")
    expect(result.text).toBeUndefined()
  })

  test("hydrates read_file mixed image+text blocks", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-img-2",
      input: { file_path: "/tmp/diagram.png" },
    })

    const raw = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/4AAQ=" } },
      { type: "text", text: "A photo of a diagram" },
    ]

    const result = hydrateToolResult(tool, raw)
    expect(isReadFileImageResult(result)).toBe(true)
    if (!isReadFileImageResult(result)) throw new Error("expected image result")
    expect(result.images).toHaveLength(1)
    expect(result.images[0].mediaType).toBe("image/jpeg")
    expect(result.text).toBe("A photo of a diagram")
  })

  test("hydrates read_file text-only array as text fallback", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-img-3",
      input: { file_path: "/tmp/file.ts" },
    })

    const raw = [
      { type: "text", text: "const x = 1" },
    ]

    const result = hydrateToolResult(tool, raw)
    // No images → falls through to existing JSON stringify behavior
    expect(isReadFileImageResult(result)).toBe(false)
  })

  test("hydrates read_file string result unchanged (regression)", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-img-4",
      input: { file_path: "/tmp/file.ts" },
    })

    expect(hydrateToolResult(tool, "line 1\nline 2")).toBe("line 1\nline 2")
  })

  test("hydrates default tool with image content blocks", () => {
    const tool = normalizeToolCall({
      toolName: "mcp__browser__screenshot",
      toolId: "tool-img-5",
      input: { url: "https://example.com" },
    })

    const raw = [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
    ]

    const result = hydrateToolResult(tool, raw)
    expect(result).not.toBeNull()
    const imageResult = result as { images: Array<{ mediaType: string; data: string }>; text?: string }
    expect(imageResult.images).toHaveLength(1)
    expect(imageResult.images[0].mediaType).toBe("image/png")
  })

  test("skips oversized base64 images in read_file", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-img-6",
      input: { file_path: "/tmp/huge.png" },
    })

    const hugeData = "A".repeat(11 * 1024 * 1024) // > 10MB
    const raw = [
      { type: "image", source: { type: "base64", media_type: "image/png", data: hugeData } },
    ]

    const result = hydrateToolResult(tool, raw)
    // Oversized image skipped → no images → not an image result
    expect(isReadFileImageResult(result)).toBe(false)
  })

  test("rejects disallowed media types in image blocks", () => {
    const tool = normalizeToolCall({
      toolName: "Read",
      toolId: "tool-img-7",
      input: { file_path: "/tmp/payload.html" },
    })

    const raw = [
      { type: "image", source: { type: "base64", media_type: "text/html", data: "PHNjcmlwdD4=" } },
    ]

    const result = hydrateToolResult(tool, raw)
    expect(isReadFileImageResult(result)).toBe(false)
  })
})

describe("isReadFileImageResult", () => {
  test("returns false for null", () => {
    expect(isReadFileImageResult(null)).toBe(false)
  })

  test("returns false for string", () => {
    expect(isReadFileImageResult("some text")).toBe(false)
  })

  test("returns false for object with non-array images", () => {
    expect(isReadFileImageResult({ images: "not-array" })).toBe(false)
  })

  test("returns true for object with empty images array", () => {
    expect(isReadFileImageResult({ images: [] })).toBe(true)
  })

  test("returns true for valid ReadFileImageResult", () => {
    expect(isReadFileImageResult({ images: [{ mediaType: "image/png", data: "abc" }], text: "caption" })).toBe(true)
  })
})

describe("hydrateToolResult (continued)", () => {
  test("preserves present_content error payloads", () => {
    const tool = normalizeToolCall({
      toolName: "present_content",
      toolId: "tool-5",
      input: {
        title: "Snippet",
        kind: "code",
        format: "typescript",
        source: "const x = 1",
      },
    })

    const result = hydrateToolResult(tool, {
      error: {
        source: "schema_validation",
        schema: "present_content",
        issues: [
          {
            path: ["summary"],
            code: "invalid_type",
            message: "Invalid input: expected string, received number",
          },
        ],
      },
    })

    expect(result).toEqual({
      error: {
        source: "schema_validation",
        schema: "present_content",
        issues: [
          {
            path: ["summary"],
            code: "invalid_type",
            message: "Invalid input: expected string, received number",
          },
        ],
      },
    })
  })
})
