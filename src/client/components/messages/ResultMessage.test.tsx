import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getResultErrorDetail, ResultMessage } from "./ResultMessage"
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
  test("normalizes only leading session-ended fallback detail", () => {
    expect(getResultErrorDetail([
      "",
      "Session ended unexpectedly",
      "This usually means the CLI process crashed or was killed.",
      "API Error: 500",
      "request_id=req_123",
    ].join("\n"))).toBe("API Error: 500\nrequest_id=req_123")

    expect(getResultErrorDetail("API rate limit exceeded")).toBe("API rate limit exceeded")
    expect(getResultErrorDetail("prefix\nSession ended unexpectedly")).toBe("prefix\nSession ended unexpectedly")
  })

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

  test("dedupes session-ended fallback text from error details", () => {
    const result = [
      "Session ended unexpectedly",
      "This usually means the CLI process crashed or was killed.",
      'API Error: 500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}',
    ].join("\n")

    const html = renderToStaticMarkup(
      <ResultMessage message={createMessage({ success: false, result })} />
    )

    expect(html.match(/Session ended unexpectedly/g)).toHaveLength(1)
    expect(html.match(/This usually means the CLI process crashed or was killed/g)).toHaveLength(1)
    expect(html).toContain("API Error: 500")
  })
})
