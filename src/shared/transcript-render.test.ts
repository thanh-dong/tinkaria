import { describe, expect, test } from "bun:test"
import type { NormalizedToolCall, TranscriptEntry } from "./types"
import {
  foldTranscriptRenderUnits,
  getTranscriptRenderUnitId,
} from "./transcript-render"

let sequence = 0

function entry<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(partial: T): TranscriptEntry {
  sequence += 1
  return {
    _id: `e${sequence}`,
    createdAt: sequence,
    ...partial,
  } as TranscriptEntry
}

function text(value: string): TranscriptEntry {
  return entry({ kind: "assistant_text", text: value })
}

function user(content = "Hello"): TranscriptEntry {
  return entry({ kind: "user_prompt", content })
}

function result(value = "Done"): TranscriptEntry {
  return entry({
    kind: "result",
    subtype: "success",
    isError: false,
    durationMs: 100,
    result: value,
  })
}

function status(value: string): TranscriptEntry {
  return entry({ kind: "status", status: value })
}

function toolCall(tool: NormalizedToolCall): TranscriptEntry {
  return entry({ kind: "tool_call", tool })
}

function toolResult(toolId: string, content: unknown, isError = false): TranscriptEntry {
  return entry({ kind: "tool_result", toolId, content, isError })
}

function bash(toolId: string, command = "echo hi"): TranscriptEntry {
  return toolCall({
    kind: "tool",
    toolKind: "bash",
    toolName: "Bash",
    toolId,
    input: { command },
  })
}

function erroredSkill(toolId: string): TranscriptEntry[] {
  return [
    toolCall({
      kind: "tool",
      toolKind: "skill",
      toolName: "Skill",
      toolId,
      input: { skill: "missing" },
    }),
    toolResult(toolId, "Skill not found: missing", true),
  ]
}

function askUser(toolId: string): TranscriptEntry {
  return toolCall({
    kind: "tool",
    toolKind: "ask_user_question",
    toolName: "AskUserQuestion",
    toolId,
    input: { questions: [{ question: "Pick one" }] },
  })
}

function todoWrite(toolId: string, content: string): TranscriptEntry {
  return toolCall({
    kind: "tool",
    toolKind: "todo_write",
    toolName: "TodoWrite",
    toolId,
    input: { todos: [{ content, status: "pending", activeForm: content }] },
  })
}

function presentContent(toolId: string): TranscriptEntry {
  return toolCall({
    kind: "tool",
    toolKind: "present_content",
    toolName: "present_content",
    toolId,
    input: {
      title: "Artifact",
      kind: "markdown",
      format: "markdown",
      source: "Hello",
    },
  })
}

function unknownTool(toolId: string): TranscriptEntry {
  return toolCall({
    kind: "tool",
    toolKind: "unknown_tool",
    toolName: "FutureTool",
    toolId,
    input: { payload: { hello: "world" } },
  })
}

describe("getTranscriptRenderUnitId", () => {
  test("uses deterministic prefixed ids", () => {
    expect(getTranscriptRenderUnitId("assistant_response", ["e1"])).toBe("assistant_response:e1")
    expect(getTranscriptRenderUnitId("wip_block", ["e1", "e2", "e3"])).toBe("wip:e1:e3")
    expect(getTranscriptRenderUnitId("tool_group", ["e2", "e3"])).toBe("tools:e2:e3")
    expect(getTranscriptRenderUnitId("artifact", ["e4"])).toBe("artifact:e4")
    expect(getTranscriptRenderUnitId("unknown", ["e5"])).toBe("unknown:e5")
  })
})

describe("foldTranscriptRenderUnits", () => {
  test("returns an empty render window for an empty transcript", () => {
    expect(foldTranscriptRenderUnits([])).toEqual([])
  })

  test("folds narration plus work tool into WIP and final text into response", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([text("Checking"), bash("t1"), text("Fixed")])
    expect(units.map((unit) => unit.kind)).toEqual(["wip_block", "assistant_response"])
    expect(units[0]?.id).toBe("wip:e1:e2")
    expect(units[1]?.id).toBe("assistant_response:e3")
  })

  test("ejects rationale text before interactive question", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([
      text("Checking"),
      bash("t1"),
      text("Pick one:"),
      askUser("q1"),
    ], { isLoading: true })
    expect(units.map((unit) => unit.kind)).toEqual(["wip_block", "assistant_response", "standalone_tool"])
    expect(units[1]?.sourceEntryIds).toEqual(["e3"])
  })

  test("keeps only the latest TodoWrite projection visible", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([
      todoWrite("todo-1", "old"),
      text("Working"),
      todoWrite("todo-2", "new"),
    ], { isLoading: true })
    expect(units.map((unit) => unit.kind)).toEqual(["wip_block", "standalone_tool"])
    expect(units[1]?.sourceEntryIds).toEqual(["e3"])
  })

  test("renders present_content as an artifact unit, not a tool", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([presentContent("p1")])
    expect(units.map((unit) => unit.kind)).toEqual(["artifact"])
    expect(units[0]?.id).toBe("artifact:e1")
  })

  test("keeps errored tools standalone and visible", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([text("Trying skill"), ...erroredSkill("s1"), text("Failed")])
    expect(units.map((unit) => unit.kind)).toEqual(["assistant_response", "standalone_tool", "assistant_response"])
    expect(units[1]?.sourceEntryIds).toEqual(["e2", "e3"])
  })

  test("deduplicates system_init and account_info by first visible entry", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([
      entry({ kind: "system_init", provider: "claude", model: "sonnet", tools: [], agents: [], slashCommands: [], mcpServers: [] }),
      entry({ kind: "system_init", provider: "claude", model: "sonnet", tools: [], agents: [], slashCommands: [], mcpServers: [] }),
      entry({ kind: "account_info", accountInfo: { email: "a@example.com" } }),
      entry({ kind: "account_info", accountInfo: { email: "b@example.com" } }),
    ])
    expect(units.map((unit) => unit.kind)).toEqual(["system_init", "account_info"])
    expect(units.map((unit) => unit.sourceEntryIds[0])).toEqual(["e1", "e3"])
  })

  test("renders only latest status and hides result next to context_cleared", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([
      status("running"),
      status("waiting_for_user"),
      result("Session compacted"),
      entry({ kind: "context_cleared" }),
    ], { isLoading: true })
    expect(units.map((unit) => unit.kind)).toEqual(["context_cleared", "status"])
    expect(units[1]?.sourceEntryIds).toEqual(["e2"])
  })

  test("unknown tools render standalone instead of hiding", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([unknownTool("u1")])
    expect(units.map((unit) => unit.kind)).toEqual(["standalone_tool"])
  })

  test("does not crash on pending tools or interrupted streams", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([text("Working"), bash("t1"), entry({ kind: "interrupted" })], { isLoading: true })
    expect(units.map((unit) => unit.kind)).toEqual(["wip_block", "interrupted"])
  })

  test("does not group across consecutive user prompts", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([user("one"), user("two"), text("Answer")])
    expect(units.map((unit) => unit.kind)).toEqual(["user_prompt", "user_prompt", "assistant_response"])
  })

  test("groups consecutive work tools outside assistant WIP context as a tool group", () => {
    sequence = 0
    const units = foldTranscriptRenderUnits([bash("t1"), bash("t2")])
    expect(units.map((unit) => unit.kind)).toEqual(["tool_group"])
    expect(units[0]?.id).toBe("tools:e1:e2")
  })
})
