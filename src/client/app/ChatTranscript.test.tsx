import { afterEach, describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { RefObject } from "react"
import type { HydratedTranscriptMessage, TranscriptRenderUnit } from "../../shared/types"

type PresentContentMessageType = Extract<
  HydratedTranscriptMessage,
  { kind: "tool"; toolKind: "present_content" }
>

function createPresentContentMessage(): PresentContentMessageType {
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
  test("renders present_content through render-unit artifact data", async () => {
    await mock.module("@tanstack/react-virtual", () => ({
      useVirtualizer: ({ count }: { count: number }) => ({
        getTotalSize: () => Math.max(1, count) * 80,
        getVirtualItems: () => (count > 0 ? [{ key: 0, index: 0, start: 0 }] : []),
        measureElement: () => {},
        scrollToIndex: () => {},
      }),
    }))

    const artifact = createPresentContentMessage()
    const renderUnit: TranscriptRenderUnit = {
      kind: "artifact",
      id: "artifact:entry-1",
      sourceEntryIds: ["entry-1"],
      artifact,
    }

    const { ChatTranscript } = await import("./ChatTranscript")
    const scrollRef = { current: null } as RefObject<HTMLDivElement | null>
    const html = renderToStaticMarkup(
      <ChatTranscript
        messages={[renderUnit]}
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

  test("renders only visible render units without null row filtering", async () => {
    await mock.module("@tanstack/react-virtual", () => ({
      useVirtualizer: ({ count }: { count: number }) => ({
        getTotalSize: () => Math.max(1, count) * 80,
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ key: index, index, start: index * 80 })),
        measureElement: () => {},
        scrollToIndex: () => {},
      }),
    }))

    const message: Extract<HydratedTranscriptMessage, { kind: "status" }> = {
      kind: "status",
      id: "status-1",
      timestamp: "2026-04-16T00:00:00.000Z",
      status: "running",
    }
    const renderUnit: TranscriptRenderUnit = {
      kind: "status",
      id: "status:status-1",
      sourceEntryIds: ["status-1"],
      message,
    }

    const { ChatTranscript } = await import("./ChatTranscript")
    const html = renderToStaticMarkup(
      <ChatTranscript
        messages={[renderUnit]}
        scrollRef={{ current: null } as RefObject<HTMLDivElement | null>}
        isLoading={false}
        latestToolIds={{ AskUserQuestion: null, ExitPlanMode: null, TodoWrite: null }}
        onOpenLocalLink={() => {}}
        onOpenExternalLink={() => false}
        onAskUserQuestionSubmit={() => {}}
        onExitPlanModeConfirm={() => {}}
      />
    )

    expect(html).toContain('id="msg-status-1"')
    expect(html).toContain("running")
  })
})
