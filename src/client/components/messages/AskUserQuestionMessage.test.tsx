import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { AskUserQuestionMessage } from "./AskUserQuestionMessage"
import type { ProcessedToolCall } from "./types"

function createMessage(): Extract<ProcessedToolCall, { toolKind: "ask_user_question" }> {
  return {
    toolKind: "ask_user_question",
    toolId: "toolu_ask",
    title: "Ask user",
    isExpanded: true,
    hasResult: false,
    input: {
      questions: [
        {
          id: "delivery_method",
          question: "Choose the best delivery method for this unusually long decision point",
          options: [
            {
              label: "A very long option label that should wrap onto multiple lines instead of truncating midway through the sentence",
              description: "A matching long description should also stay readable rather than being clipped after a couple of lines."
            }
          ]
        }
      ]
    },
    result: undefined
  }
}

describe("AskUserQuestionMessage", () => {
  test("renders option labels and descriptions without truncation classes", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionMessage
        message={createMessage()}
        onSubmit={() => {}}
        isLatest={true}
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
        isLatest={true}
      />
    )

    expect(html).toContain("border-0")
    expect(html).toContain("rounded-none")
    expect(html).toContain("focus-visible:ring-0")
  })
})
