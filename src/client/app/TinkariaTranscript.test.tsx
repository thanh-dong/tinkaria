import { afterEach, describe, expect, mock, test } from "bun:test"
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

describe("TinkariaTranscript", () => {
  test("maps an unread message id to the containing render row, including collapsed tool groups", async () => {
    const { getRenderItemIndexForMessageId } = await import("./TinkariaTranscript")

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

    const { TinkariaTranscript } = await import("./TinkariaTranscript")
    const scrollRef = { current: null } as RefObject<HTMLDivElement | null>
    const html = renderToStaticMarkup(
      <TinkariaTranscript
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
