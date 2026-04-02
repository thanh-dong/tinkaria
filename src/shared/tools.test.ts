import { describe, expect, test } from "bun:test"
import { hydrateToolResult, normalizeToolCall } from "./tools"

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
