import { afterEach, describe, expect, mock, test } from "bun:test"
import type { HydratedTranscriptMessage } from "../../shared/types"

const mockPrepare = mock(() => ({ __brand: true }))
const mockLayout = mock(() => ({ height: 120, lineCount: 5 }))

mock.module("@chenglou/pretext", () => ({
  prepare: mockPrepare,
  layout: mockLayout,
}))

// Import after mock is set up
const { estimateMessageHeight, estimateRenderItemHeight, clearHeightCache } = await import("./messageHeights")

afterEach(() => {
  mockPrepare.mockClear()
  mockLayout.mockClear()
  clearHeightCache()
})

let idCounter = 0
function nextId() {
  return `msg-${++idCounter}`
}

function makeText(text: string): HydratedTranscriptMessage {
  return { kind: "assistant_text", text, id: nextId(), timestamp: "2026-04-06T00:00:00Z" }
}

function makeUserPrompt(content: string): HydratedTranscriptMessage {
  return { kind: "user_prompt", content, id: nextId(), timestamp: "2026-04-06T00:00:00Z" }
}

function makeToolCall(): HydratedTranscriptMessage {
  return {
    kind: "tool",
    toolKind: "bash",
    toolName: "Bash",
    toolId: "tool-1",
    id: nextId(),
    timestamp: "2026-04-06T00:00:00Z",
    input: {},
    result: null,
  } as HydratedTranscriptMessage
}

describe("estimateMessageHeight", () => {
  test("assistant_text calls prepare + layout and returns computed height + padding", () => {
    const height = estimateMessageHeight(makeText("Hello world"), 800, true)

    expect(mockPrepare).toHaveBeenCalledWith("Hello world", "14px Body", undefined)
    expect(mockLayout).toHaveBeenCalled()
    // height = 120 (mock) + 20 (MESSAGE_PADDING_BOTTOM) = 140
    expect(height).toBe(140)
  })

  test("user_prompt uses pre-wrap and narrower width for bubble", () => {
    const height = estimateMessageHeight(makeUserPrompt("Hello\nWorld"), 800, true)

    expect(mockPrepare).toHaveBeenCalledWith("Hello\nWorld", "14px Body", { whiteSpace: "pre-wrap" })
    const expectedWidth = 800 * 0.8 - 28
    expect(mockLayout).toHaveBeenCalledWith(expect.anything(), expectedWidth, 24)
    // height = 120 (mock) + 12 (USER_BUBBLE_PADDING_VERTICAL) + 20 (MESSAGE_PADDING_BOTTOM) = 152
    expect(height).toBe(152)
  })

  test("tool message returns type-specific fallback, not 80", () => {
    const height = estimateMessageHeight(makeToolCall(), 800, true)

    expect(mockPrepare).not.toHaveBeenCalled()
    expect(height).toBe(56)
  })

  test("returns flat fallback when font not ready", () => {
    const height = estimateMessageHeight(makeText("Hello world"), 800, false)

    expect(mockPrepare).not.toHaveBeenCalled()
    expect(height).toBe(80)
  })

  test("system_init returns collapsed height", () => {
    const msg: HydratedTranscriptMessage = {
      kind: "system_init", id: nextId(), timestamp: "2026-04-06T00:00:00Z",
      model: "claude", tools: [], agents: [], slashCommands: [], mcpServers: [], provider: "claude",
    } as HydratedTranscriptMessage

    expect(estimateMessageHeight(msg, 800, true)).toBe(48)
  })

  test("compact_boundary returns small fixed height", () => {
    const msg: HydratedTranscriptMessage = {
      kind: "compact_boundary", id: nextId(), timestamp: "2026-04-06T00:00:00Z",
    }

    expect(estimateMessageHeight(msg, 800, true)).toBe(40)
  })

  test("status returns small fixed height", () => {
    const msg: HydratedTranscriptMessage = {
      kind: "status", id: nextId(), status: "idle", timestamp: "2026-04-06T00:00:00Z",
    }

    expect(estimateMessageHeight(msg, 800, true)).toBe(32)
  })

  test("account_info returns zero (hidden by default)", () => {
    const msg = {
      kind: "account_info", id: nextId(), timestamp: "2026-04-06T00:00:00Z",
      accountInfo: {},
    } as HydratedTranscriptMessage

    expect(estimateMessageHeight(msg, 800, true)).toBe(0)
  })

  test("accounts for paragraph margins in assistant_text", () => {
    // Text with 2 paragraph breaks → 2 * 16px = 32px extra margin
    const msg = makeText("First paragraph\n\nSecond paragraph\n\nThird paragraph")
    const height = estimateMessageHeight(msg, 800, true)
    // 120 (mock layout) + 32 (2 gaps * 16px) + 20 (padding) = 172
    expect(height).toBe(172)
  })

  test("caches prepared text — second call skips prepare", () => {
    const msg = makeText("Cached text")
    estimateMessageHeight(msg, 800, true)
    mockPrepare.mockClear()

    estimateMessageHeight(msg, 600, true) // different width, same message

    expect(mockPrepare).not.toHaveBeenCalled() // cached
    expect(mockLayout).toHaveBeenCalled() // layout still runs with new width
  })
})

describe("prepared cache LRU eviction", () => {
  test("evicts oldest entries when cache exceeds 500", () => {
    // Fill cache with 500 unique messages
    for (let i = 0; i < 501; i++) {
      const msg: HydratedTranscriptMessage = {
        kind: "assistant_text", text: `msg ${i}`, id: `lru-${i}`, timestamp: "2026-04-06T00:00:00Z",
      }
      estimateMessageHeight(msg, 800, true)
    }
    // 501 prepares called (all unique)
    expect(mockPrepare).toHaveBeenCalledTimes(501)
    mockPrepare.mockClear()

    // Re-estimate the FIRST message — should call prepare again (evicted)
    const evicted: HydratedTranscriptMessage = {
      kind: "assistant_text", text: "msg 0", id: "lru-0", timestamp: "2026-04-06T00:00:00Z",
    }
    estimateMessageHeight(evicted, 800, true)
    expect(mockPrepare).toHaveBeenCalledTimes(1)
    mockPrepare.mockClear()

    // Re-estimate a recent message — should NOT call prepare (cached)
    const cached: HydratedTranscriptMessage = {
      kind: "assistant_text", text: "msg 500", id: "lru-500", timestamp: "2026-04-06T00:00:00Z",
    }
    estimateMessageHeight(cached, 800, true)
    expect(mockPrepare).not.toHaveBeenCalled()
  })
})

describe("estimateRenderItemHeight", () => {
  test("tool-group returns group fallback height", () => {
    const item = {
      type: "tool-group" as const,
      messages: [makeToolCall(), makeToolCall()],
      startIndex: 0,
    }

    expect(estimateRenderItemHeight(item, 800, true)).toBe(64)
  })

  test("single item delegates to estimateMessageHeight", () => {
    const item = {
      type: "single" as const,
      message: makeText("Hello world"),
      index: 0,
    }

    const height = estimateRenderItemHeight(item, 800, true)
    expect(height).toBe(140) // 120 + 20 padding
  })
})
