// src/server/project-cli.test.ts
import { describe, expect, test } from "bun:test"
import { parseProjectCliArgs, formatOutput } from "./project-cli"

describe("parseProjectCliArgs", () => {
  test("parses 'sessions' command", () => {
    const result = parseProjectCliArgs(["sessions"])
    expect(result).toEqual({ command: "sessions", args: {} })
  })

  test("parses 'sessions <id>' command", () => {
    const result = parseProjectCliArgs(["sessions", "chat-1"])
    expect(result).toEqual({ command: "session-detail", args: { chatId: "chat-1" } })
  })

  test("parses 'search <query>' command", () => {
    const result = parseProjectCliArgs(["search", "auth", "middleware"])
    expect(result).toEqual({ command: "search", args: { query: "auth middleware" } })
  })

  test("parses 'tasks' command", () => {
    const result = parseProjectCliArgs(["tasks"])
    expect(result).toEqual({ command: "tasks", args: {} })
  })

  test("parses 'tasks <id>' command", () => {
    const result = parseProjectCliArgs(["tasks", "t-1"])
    expect(result).toEqual({ command: "task-detail", args: { taskId: "t-1" } })
  })

  test("parses 'claim <description>' with flags", () => {
    const result = parseProjectCliArgs(["claim", "implement auth", "--session", "c1", "--branch", "feat/auth"])
    expect(result).toEqual({
      command: "claim",
      args: { description: "implement auth", session: "c1", branch: "feat/auth" },
    })
  })

  test("parses 'complete <id>'", () => {
    const result = parseProjectCliArgs(["complete", "t-1"])
    expect(result).toEqual({ command: "complete", args: { taskId: "t-1" } })
  })

  test("parses 'delegate <request>'", () => {
    const result = parseProjectCliArgs(["delegate", "ensure", "postgres", "running"])
    expect(result).toEqual({ command: "delegate", args: { request: "ensure postgres running" } })
  })

  test("parses --project flag", () => {
    const result = parseProjectCliArgs(["sessions", "--project", "p1"])
    expect(result).toEqual({ command: "sessions", args: { workspaceId: "p1" } })
  })

  test("returns help for no args", () => {
    const result = parseProjectCliArgs([])
    expect(result.command).toBe("help")
  })

  test("returns help for --help", () => {
    const result = parseProjectCliArgs(["--help"])
    expect(result.command).toBe("help")
  })
})

describe("formatOutput", () => {
  test("formats sessions as table when not --json", () => {
    const output = formatOutput("sessions", [
      { chatId: "c1", intent: "auth work", status: "active", provider: "claude", branch: null, filesTouched: [], commandsRun: [], lastActivity: "2026-04-04T10:00:00Z" },
    ], false)
    expect(output).toContain("c1")
    expect(output).toContain("auth work")
  })

  test("formats as JSON when json=true", () => {
    const data = [{ chatId: "c1" }]
    const output = formatOutput("sessions", data, true)
    expect(JSON.parse(output)).toEqual(data)
  })
})
