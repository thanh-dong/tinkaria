import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ResultMessage } from "./ResultMessage"
import type { ProcessedResultMessage } from "./types"

function createMessage(overrides: Partial<ProcessedResultMessage> = {}): ProcessedResultMessage {
  return {
    kind: "result",
    id: "msg-1",
    timestamp: "2026-04-04T00:00:00.000Z",
    success: true,
    result: "",
    durationMs: 0,
    ...overrides,
  }
}

describe("ResultMessage", () => {
  test("renders cancelled result as interrupted pill, not error", () => {
    const html = renderToStaticMarkup(
      <ResultMessage message={createMessage({ success: true, cancelled: true, result: "" })} />
    )

    expect(html).toContain("Interrupted")
    expect(html).not.toContain("error")
    expect(html).not.toContain("unknown")
  })

  test("renders error with empty result as session-ended message, not unknown error", () => {
    const html = renderToStaticMarkup(
      <ResultMessage message={createMessage({ success: false, result: "" })} />
    )

    expect(html).not.toContain("unknown")
    expect(html.toLowerCase()).toContain("session ended unexpectedly")
  })

  test("renders error with result text as-is", () => {
    const html = renderToStaticMarkup(
      <ResultMessage message={createMessage({ success: false, result: "API rate limit exceeded" })} />
    )

    expect(html).toContain("API rate limit exceeded")
  })
})
