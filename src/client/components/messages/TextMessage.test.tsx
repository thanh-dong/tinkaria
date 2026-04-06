import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TextMessage } from "./TextMessage"
import type { ProcessedTextMessage } from "./types"

function createMessage(text: string): ProcessedTextMessage {
  return {
    kind: "assistant_text",
    id: "msg-1",
    timestamp: "2026-04-02T00:00:00.000Z",
    text,
  }
}

describe("TextMessage", () => {
  test("renders incomplete bold markdown without exposing unfinished markers", () => {
    const html = renderToStaticMarkup(
      <TextMessage message={createMessage("This is **unfinished bold")} />
    )

    expect(html).toContain('data-streamdown="strong"')
    expect(html).not.toContain("**unfinished bold")
  })

  test("autolinks bare assistant urls such as diashort links", () => {
    const html = renderToStaticMarkup(
      <TextMessage message={createMessage("Diagram: https://diashort.apps.quickable.co/d/abc123")} />
    )

    expect(html).toContain('href="https://diashort.apps.quickable.co/d/abc123"')
    expect(html).toContain("https://diashort.apps.quickable.co/d/abc123")
    expect(html).toContain("Embedded Diagram")
    expect(html).toContain('data-remote-embed="true"')
    expect(html).toContain("diashort.apps.quickable.co/e/abc123")
  })

  test("deduplicates repeated diashort links into one embed card", () => {
    const html = renderToStaticMarkup(
      <TextMessage
        message={createMessage(
          "Same diagram twice: https://diashort.apps.quickable.co/d/abc123 and https://diashort.apps.quickable.co/d/abc123"
        )}
      />
    )

    expect(html.match(/Embedded Diagram/g)?.length).toBe(1)
  })

  test("stamps readable block anchors for paragraph-level restore", () => {
    const html = renderToStaticMarkup(
      <TextMessage message={createMessage("First paragraph\n\nSecond paragraph")} />
    )

    expect(html).toContain('id="read-block-msg-1-0"')
    expect(html).toContain('id="read-block-msg-1-1"')
    expect(html).toContain('data-read-anchor-message-id="msg-1"')
  })
})
