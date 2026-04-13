import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { AskUserQuestionMessage } from "./AskUserQuestionMessage"
import type { ProcessedToolCall } from "./types"

function createMessage(): Extract<ProcessedToolCall, { toolKind: "ask_user_question" }> {
  return {
    kind: "tool",
    hidden: false,
    id: "tool-message-1",
    messageId: undefined,
    timestamp: "2026-04-13T00:00:00.000Z",
    toolId: "tool-ask-1",
    toolKind: "ask_user_question",
    toolName: "AskUserQuestion",
    input: {
      questions: [
        {
          id: "delivery_method",
          question: "Choose the best delivery method for this unusually long decision point",
          options: [
            {
              label: "A very long option label that should wrap onto multiple lines instead of truncating midway through the sentence",
              description: "A matching long description should also stay readable rather than being clipped after a couple of lines.",
            },
          ],
        },
      ],
    },
  }
}

function createCompletedMessage(): Extract<ProcessedToolCall, { toolKind: "ask_user_question" }> {
  return {
    ...createMessage(),
    result: {
      answers: {
        delivery_method: ["Ship by courier"],
      },
    },
  }
}

describe("AskUserQuestionMessage", () => {
  test("renders option labels and descriptions without truncation classes", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionMessage
        message={createMessage()}
        onSubmit={() => {}}
        isLatest
      />
    )

    expect(html).toContain("whitespace-normal")
    expect(html).toContain("break-words")
    expect(html).not.toContain("truncate")
    expect(html).not.toContain("line-clamp-2")
  })

  test("renders the custom input without the standalone input border treatment", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionMessage
        message={createMessage()}
        onSubmit={() => {}}
        isLatest
      />
    )

    expect(html).toContain("border-0")
    expect(html).toContain("rounded-none")
    expect(html).toContain("focus-visible:ring-0")
  })

  test("keeps the custom Other row at the same small-layout height as option rows", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionMessage
        message={createMessage()}
        onSubmit={() => {}}
        isLatest
      />
    )

    expect(html).toContain("min-h-[55px]")
  })

  test("renders action options with only the intended bottom separator border", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionMessage
        message={createMessage()}
        onSubmit={() => {}}
        isLatest
      />
    )

    expect(html).toContain('data-ui-id="message.ask-user.option.action"')
    expect(html).toContain("border-b")
    expect(html).toContain("border-x-0")
    expect(html).toContain("border-t-0")
  })

  test("renders completed questions as stacked question and answer blocks without legacy header labels", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionMessage
        message={createCompletedMessage()}
        onSubmit={() => {}}
        isLatest
      />
    )

    expect(html).toContain("<dl")
    expect(html).toContain("<dt")
    expect(html).toContain("<dd")
    expect(html).toContain(">Question<")
    expect(html).toContain(">Answer<")
    expect(html).toContain("Ship by courier")
    expect(html).not.toContain(">Questions<")
    expect(html).not.toContain(">Answers<")
  })
})
