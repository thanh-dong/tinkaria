import { afterEach, describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { RefObject } from "react"
import type { HydratedTranscriptMessage } from "../../shared/types"
import { groupMessages } from "./ChatTranscript"

type PresentContentMessageType = Extract<
  HydratedTranscriptMessage,
  { kind: "tool"; toolKind: "present_content" }
>

function createMessage(): PresentContentMessageType {
  return {
    hidden: false,
    id: "tool-1",
    input: {
      title: "Transcript markdown",
      kind: "markdown",
      format: "markdown",
      source: "Hello **world**",
      collapsed: false,
    },
    kind: "tool",
    messageId: undefined,
    result: {
      accepted: true,
      title: "Transcript markdown",
      kind: "markdown",
      format: "markdown",
      source: "Hello **world**",
      collapsed: false,
    },
    timestamp: "2026-04-02T00:00:00.000Z",
    toolId: "tool-1",
    toolKind: "present_content",
    toolName: "present_content",
  }
}

afterEach(() => {
  mock.restore()
})

describe("ChatTranscript", () => {
  test("renders present_content through the dedicated transcript message component", async () => {
    await mock.module("@tanstack/react-virtual", () => ({
      useVirtualizer: ({ count }: { count: number }) => ({
        getTotalSize: () => Math.max(1, count) * 80,
        getVirtualItems: () => (count > 0 ? [{ key: 0, index: 0, start: 0 }] : []),
        measureElement: () => {},
        scrollToIndex: () => {},
      }),
    }))

    const { ChatTranscript } = await import("./ChatTranscript")
    const scrollRef = { current: null } as RefObject<HTMLDivElement | null>
    const html = renderToStaticMarkup(
      <ChatTranscript
        messages={[createMessage()]}
        scrollRef={scrollRef}
        isLoading={false}
        latestToolIds={{ AskUserQuestion: null, ExitPlanMode: null, TodoWrite: null }}
        onOpenLocalLink={() => {}}
        onOpenExternalLink={() => false}
        onAskUserQuestionSubmit={() => {}}
        onExitPlanModeConfirm={() => {}}
      />
    )

    expect(html).toContain('data-ui-id="message.present_content.item"')
    expect(html).toContain('data-streamdown="strong"')
    expect(html).toContain("world")
  })
})

// ── groupMessages tests ───────────────────────────────────────────

let idCounter = 0
function nextId() { return `msg-${++idCounter}` }

function text(content: string): HydratedTranscriptMessage {
  return { kind: "assistant_text", text: content, id: nextId(), timestamp: "2026-04-06T00:00:00Z" }
}

function tool(name = "Bash"): HydratedTranscriptMessage {
  return {
    kind: "tool", toolKind: "bash", toolName: name, toolId: nextId(),
    id: nextId(), timestamp: "2026-04-06T00:00:00Z", input: {},
  } as HydratedTranscriptMessage
}

function specialTool(): HydratedTranscriptMessage {
  return {
    kind: "tool", toolKind: "ask_user_question", toolName: "AskUserQuestion", toolId: nextId(),
    id: nextId(), timestamp: "2026-04-06T00:00:00Z", input: { questions: [] },
  } as HydratedTranscriptMessage
}

function erroredTool(name = "Skill"): HydratedTranscriptMessage {
  return {
    kind: "tool", toolKind: "skill", toolName: name, toolId: nextId(),
    id: nextId(), timestamp: "2026-04-06T00:00:00Z", input: { skill: "missing-skill" },
    isError: true, result: "Skill not found: missing-skill",
  } as HydratedTranscriptMessage
}

function userPrompt(): HydratedTranscriptMessage {
  return { kind: "user_prompt", content: "Hello", id: nextId(), timestamp: "2026-04-06T00:00:00Z" }
}

describe("groupMessages", () => {
  test("single assistant_text with no tools stays as single", () => {
    const msgs = [text("Hello")]
    const items = groupMessages(msgs, false)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("single")
  })

  test("narration + tool forms wip-block when turn is done", () => {
    // narration → tool → answer
    const msgs = [text("Let me check"), tool(), text("Fixed it")]
    const items = groupMessages(msgs, false)

    // narration+tool → wip-block, answer → single
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(2) // narration + tool
    }
    expect(items[1].type).toBe("single")
  })

  test("multiple narration + tools form single wip-block", () => {
    const msgs = [
      text("Looking at code"), tool(), text("I see the issue"), tool(),
      text("Now fixing"), tool(), text("Done, the fix is..."),
    ]
    const items = groupMessages(msgs, false)

    expect(items).toHaveLength(2) // wip-block + answer
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(6) // 3 narrations + 3 tools
    }
    expect(items[1].type).toBe("single") // answer
  })

  test("live turn: no answer identified when tool follows last text", () => {
    // During live turn, last text is before a tool — all is narration
    const msgs = [text("Checking"), tool(), text("Fixing"), tool()]
    const items = groupMessages(msgs, true)

    // Everything absorbed into wip-block (no answer yet)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(4)
    }
  })

  test("live turn: trailing text after tools is absorbed during loading to prevent flash", () => {
    const msgs = [text("Checking"), tool(), text("Here is the answer")]
    const items = groupMessages(msgs, true)

    // During loading, trailing text after tools stays in the wip-block
    // to prevent the flash where text briefly renders as TextMessage
    // then gets absorbed when a tool follows
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(3)
    }
  })

  test("live turn: trailing text without prior tools IS the answer", () => {
    // No tools before the text — this is a simple Q&A, show as TextMessage
    const msgs = [text("Here is the answer")]
    const items = groupMessages(msgs, true)

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("single") // genuine answer
  })

  test("special tool breaks wip-block boundary", () => {
    const msgs = [text("Narration"), tool(), specialTool(), text("After special")]
    const items = groupMessages(msgs, false)

    // narration+tool → wip-block, special → single, "After special" is answer → single
    expect(items).toHaveLength(3)
    expect(items[0].type).toBe("wip-block")
    expect(items[1].type).toBe("single") // special tool
    expect(items[2].type).toBe("single") // answer
  })

  test("assistant text before special tool is ejected from wip-block so rationale is visible", () => {
    // narration → tool → rationale text → AskUserQuestion → answer
    const msgs = [text("Let me explore"), tool(), text("Here is what I found, pick one:"), specialTool(), text("Great choice")]
    const items = groupMessages(msgs, false)

    // wip-block (narration+tool), rationale → single, special → single, answer → single
    expect(items).toHaveLength(4)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(2) // "Let me explore" + tool only
    }
    expect(items[1].type).toBe("single") // rationale text visible
    if (items[1].type === "single") {
      expect(items[1].message.kind).toBe("assistant_text")
    }
    expect(items[2].type).toBe("single") // AskUserQuestion
    expect(items[3].type).toBe("single") // answer
  })

  test("multiple trailing texts before special tool are all ejected", () => {
    const msgs = [text("Checking"), tool(), text("Found options"), text("Here are the choices:"), specialTool()]
    const items = groupMessages(msgs, true)

    // wip-block (narration+tool), 2 texts ejected as singles, special → single
    expect(items).toHaveLength(4)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(2) // "Checking" + tool
    }
    expect(items[1].type).toBe("single") // "Found options"
    expect(items[2].type).toBe("single") // "Here are the choices:"
    expect(items[3].type).toBe("single") // special tool
  })

  test("tool-only groups outside narration context use tool-group", () => {
    const msgs = [text("Answer"), tool(), tool()]
    // "Answer" is the last text (answer), then 2 tools follow
    // But wait — tools FOLLOW the answer, so answerIndex=0
    const items = groupMessages(msgs, false)

    // Answer is single, 2 tools form tool-group
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe("single") // answer
    expect(items[1].type).toBe("tool-group")
  })

  test("single orphan narration text stays as single (threshold) when not loading", () => {
    // Only one narration, no tools after it, then answer
    const msgs = [text("Just one thought"), text("The actual answer")]
    const items = groupMessages(msgs, false)

    // "Just one thought" alone → only 1 step, doesn't meet threshold
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe("single")
    expect(items[1].type).toBe("single")
  })

  test("single narration text becomes wip-block during loading", () => {
    // During loading, even a single narration text should be a wip-block
    // to prevent flash if a tool arrives shortly after
    const msgs = [text("Let me check"), tool(), text("Answer")]
    const items = groupMessages(msgs, true)

    // narration absorbed into wip-block during loading
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("wip-block")
  })

  test("live turn: trailing text after prior narration is suppressed to prevent flash", () => {
    // Scenario: assistant sends narration text, then more text that looks like an answer.
    // During loading, suppress the trailing text to prevent flash when tools arrive next tick.
    const msgs = [text("Let me think about this"), text("Here is a table with results")]
    const items = groupMessages(msgs, true)

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(2)
    }
  })

  test("two narration texts (no tools) form wip-block", () => {
    const msgs = [text("First thought"), text("Second thought"), text("Answer")]
    const items = groupMessages(msgs, false)

    expect(items).toHaveLength(2)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(2)
    }
    expect(items[1].type).toBe("single") // answer
  })

  test("user_prompt resets context — no cross-turn grouping", () => {
    const msgs = [text("Old answer"), userPrompt(), text("Checking"), tool(), text("New answer")]
    const items = groupMessages(msgs, false)

    // old answer → single, user → single, narration+tool → wip-block, new answer → single
    expect(items).toHaveLength(4)
    expect(items[0].type).toBe("single")
    expect(items[1].type).toBe("single")
    expect(items[2].type).toBe("wip-block")
    expect(items[3].type).toBe("single")
  })

  test("preserves existing tool-group behavior for consecutive tools", () => {
    const msgs = [tool(), tool(), tool()]
    const items = groupMessages(msgs, false)

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("tool-group")
  })

  test("errored tool breaks out of wip-block", () => {
    // narration → errored tool → answer
    const msgs = [text("Let me try this skill"), erroredTool(), text("The skill failed")]
    const items = groupMessages(msgs, false)

    // narration stays single (only 1 step, below threshold), errored tool → single, answer → single
    expect(items).toHaveLength(3)
    expect(items[0].type).toBe("single") // narration (alone, below wip threshold)
    expect(items[1].type).toBe("single") // errored tool — must NOT be absorbed
    expect(items[2].type).toBe("single") // answer
  })

  test("errored tool breaks out of tool-group", () => {
    // 3 tools where middle one errored
    const msgs = [tool(), erroredTool(), tool()]
    const items = groupMessages(msgs, false)

    // first tool → single (alone), errored → single, last tool → single (alone)
    expect(items).toHaveLength(3)
    expect(items[0].type).toBe("single")
    expect(items[1].type).toBe("single") // errored — must be standalone
    expect(items[2].type).toBe("single")
  })

  test("errored tool breaks wip-block but preceding narration+tools still group", () => {
    // narration → tool → narration → errored tool → answer
    const msgs = [text("Checking"), tool(), text("Now trying skill"), erroredTool(), text("It failed")]
    const items = groupMessages(msgs, false)

    // narration+tool+narration → wip-block (3 steps), errored → single, answer → single
    expect(items).toHaveLength(3)
    expect(items[0].type).toBe("wip-block")
    if (items[0].type === "wip-block") {
      expect(items[0].steps).toHaveLength(3) // "Checking" + tool + "Now trying skill"
    }
    expect(items[1].type).toBe("single") // errored tool standalone
    expect(items[2].type).toBe("single") // answer
  })

  test("tool with explicit isError: false is still collapsible", () => {
    const explicitlyOk = { ...tool(), isError: false } as HydratedTranscriptMessage
    const msgs = [tool(), explicitlyOk, tool()]
    const items = groupMessages(msgs, false)

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("tool-group")
  })

  test("non-errored tools still group normally alongside errored one", () => {
    // 2 good tools, then errored, then 2 more good tools
    const msgs = [tool(), tool(), erroredTool(), tool(), tool()]
    const items = groupMessages(msgs, false)

    expect(items).toHaveLength(3)
    expect(items[0].type).toBe("tool-group") // first 2
    expect(items[1].type).toBe("single")     // errored
    expect(items[2].type).toBe("tool-group") // last 2
  })
})

