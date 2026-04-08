import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { RefObject } from "react"
import type { RenderItem } from "../lib/messageHeights"
import type { HydratedTranscriptMessage } from "../../shared/types"

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
  test("maps an unread message id to the containing render row, including collapsed tool groups", async () => {
    const { getRenderItemIndexForMessageId } = await import("./ChatTranscript")

    const renderItems: RenderItem[] = [
      { type: "single", index: 0, message: { ...createMessage(), id: "single-1" } },
      {
        type: "tool-group",
        startIndex: 1,
        messages: [
          { ...createMessage(), id: "tool-1" },
          { ...createMessage(), id: "tool-2" },
        ],
      },
      { type: "single", index: 3, message: { ...createMessage(), id: "single-3" } },
    ]

    expect(getRenderItemIndexForMessageId(renderItems, "single-1")).toBe(0)
    expect(getRenderItemIndexForMessageId(renderItems, "tool-2")).toBe(1)
    expect(getRenderItemIndexForMessageId(renderItems, "single-3")).toBe(2)
    expect(getRenderItemIndexForMessageId(renderItems, "missing")).toBe(-1)
  })

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

describe("waitForBlockNode", () => {
  let rAFCallbacks: Array<() => void>
  let savedRAF: typeof globalThis.requestAnimationFrame | undefined
  let savedCAF: typeof globalThis.cancelAnimationFrame | undefined

  beforeEach(() => {
    rAFCallbacks = []
    savedRAF = globalThis.requestAnimationFrame
    savedCAF = globalThis.cancelAnimationFrame

    let nextId = 1
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = nextId++
      rAFCallbacks.push(() => cb(0))
      return id
    }
    globalThis.cancelAnimationFrame = () => {}
  })

  afterEach(() => {
    if (savedRAF) globalThis.requestAnimationFrame = savedRAF
    if (savedCAF) globalThis.cancelAnimationFrame = savedCAF
  })

  function flushOneFrame() {
    const batch = rAFCallbacks.splice(0, rAFCallbacks.length)
    for (const cb of batch) cb()
  }

  test("calls onDone with the node when found on first frame", async () => {
    const { waitForBlockNode } = await import("./ChatTranscript")
    const fakeNode = { id: "block-1" } as unknown as HTMLElement
    const lookup = (id: string) => id === "block-1" ? fakeNode : null

    let result: HTMLElement | null = null
    waitForBlockNode("block-1", 10, (node) => { result = node }, lookup)

    flushOneFrame()
    expect(result === fakeNode).toBe(true)
  })

  test("calls onDone with null after max attempts", async () => {
    const { waitForBlockNode } = await import("./ChatTranscript")
    const lookup = () => null

    let result: HTMLElement | null | undefined = undefined
    waitForBlockNode("missing", 3, (node) => { result = node }, lookup)

    flushOneFrame()
    flushOneFrame()
    flushOneFrame()
    expect(result).toBeNull()
  })

  test("cleanup prevents callback from firing", async () => {
    const { waitForBlockNode } = await import("./ChatTranscript")
    const lookup = () => null

    let callbackFired = false
    const cleanup = waitForBlockNode("missing", 10, () => { callbackFired = true }, lookup)
    cleanup()

    flushOneFrame()
    flushOneFrame()
    flushOneFrame()
    expect(callbackFired).toBe(false)
  })

  test("retries across multiple frames before finding node", async () => {
    const { waitForBlockNode } = await import("./ChatTranscript")
    let callCount = 0
    const fakeNode = { id: "block-delayed" } as unknown as HTMLElement
    const lookup = () => {
      callCount++
      return callCount >= 3 ? fakeNode : null
    }

    let result: HTMLElement | null = null
    waitForBlockNode("block-delayed", 10, (node) => { result = node }, lookup)

    flushOneFrame() // attempt 1: null
    expect(result).toBeNull()
    flushOneFrame() // attempt 2: null
    expect(result).toBeNull()
    flushOneFrame() // attempt 3: found!
    expect(result === fakeNode).toBe(true)
  })
})
