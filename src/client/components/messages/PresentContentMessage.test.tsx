import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { HydratedTranscriptMessage } from "../../../shared/types"
import { PresentContentMessage } from "./PresentContentMessage"

type PresentContentMessageType = Extract<
  HydratedTranscriptMessage,
  { kind: "tool"; toolKind: "present_content" }
>

function createMessage(
  overrides: Partial<PresentContentMessageType> & Pick<PresentContentMessageType, "id" | "toolId" | "input">
): PresentContentMessageType {
  return {
    hidden: false,
    kind: "tool",
    messageId: undefined,
    timestamp: "2026-04-02T00:00:00.000Z",
    toolKind: "present_content",
    toolName: "present_content",
    ...overrides,
  } as PresentContentMessageType
}

describe("PresentContentMessage", () => {
  test("renders markdown success content through the markdown pipeline", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={createMessage({
          id: "tool-1",
          toolId: "tool-1",
          input: {
            title: "Markdown",
            kind: "markdown",
            format: "markdown",
            source: "Hello **world**",
            summary: "Framing text",
            collapsed: false,
          },
          result: {
            accepted: true,
            title: "Markdown",
            kind: "markdown",
            format: "markdown",
            source: "Hello **world**",
            summary: "Framing text",
            collapsed: false,
          },
        })}
      />
    )

    expect(html).toContain('data-ui-id="message.present_content.item"')
    expect(html).toContain('data-ui-c3="c3-106"')
    expect(html).toContain('data-ui-c3-label="present-content"')
    expect(html).toContain("Framing text")
    expect(html).toContain('data-streamdown="strong"')
    expect(html).toContain("world")
  })

  test("renders embed success content through the embed renderer", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={createMessage({
          id: "tool-2",
          toolId: "tool-2",
          input: {
            title: "Flow",
            kind: "diagram",
            format: "mermaid",
            source: "graph TD\n  A --> B",
            collapsed: true,
          },
          result: {
            accepted: true,
            title: "Flow",
            kind: "diagram",
            format: "mermaid",
            source: "graph TD\n  A --> B",
            collapsed: true,
          },
        })}
      />
    )

    expect(html).toContain("group/rich-content")
    expect(html).toContain("data-mermaid-source")
    expect(html).toContain("graph TD")
  })

  test("renders direct embed artifacts through the remote embed path", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={createMessage({
          id: "tool-embed",
          toolId: "tool-embed",
          input: {
            title: "Architecture Preview",
            kind: "diagram",
            format: "diashort",
            source: "https://diashort.apps.quickable.co/d/abc123",
          },
          result: {
            accepted: true,
            title: "Architecture Preview",
            kind: "diagram",
            format: "diashort",
            source: "https://diashort.apps.quickable.co/d/abc123",
          },
        })}
      />
    )

    expect(html).toContain('data-remote-embed="true"')
    expect(html).toContain("diashort.apps.quickable.co/d/abc123")
  })

  test("renders pug success content through the sandboxed embed renderer", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={createMessage({
          id: "tool-pug",
          toolId: "tool-pug",
          input: {
            title: "Pug Preview",
            kind: "diagram",
            format: "pug",
            source: "main\n  h1 Hello",
          },
          result: {
            accepted: true,
            title: "Pug Preview",
            kind: "diagram",
            format: "pug",
            source: "main\n  h1 Hello",
          },
        })}
      />
    )

    expect(html).toContain("Pug Preview")
    expect(html).toContain("srcDoc")
    expect(html).toContain("&lt;main&gt;&lt;h1&gt;Hello&lt;/h1&gt;&lt;/main&gt;")
  })

  test("renders code success content in a RichContentBlock", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={createMessage({
          id: "tool-3",
          toolId: "tool-3",
          input: {
            title: "Snippet",
            kind: "code",
            format: "typescript",
            source: "const x = 1",
          },
          result: {
            accepted: true,
            title: "Snippet",
            kind: "code",
            format: "typescript",
            source: "const x = 1",
          },
        })}
      />
    )

    expect(html).toContain("group/rich-content")
    expect(html).toContain("Snippet")
    expect(html).toContain("const x = 1")
  })

  test("renders schema validation errors with visible source details", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={createMessage({
          id: "tool-4",
          toolId: "tool-4",
          input: {
            title: "Invalid",
            kind: "code",
            format: "typescript",
            source: "const x = 1",
          },
          result: {
            error: {
              source: "schema_validation",
              schema: "present_content",
              issues: [
                {
                  path: ["summary"],
                  code: "invalid_type",
                  message: "Invalid input: expected string, received number",
                },
              ],
            },
          },
        })}
      />
    )

    expect(html).toContain("schema_validation")
    expect(html).toContain("present_content")
    expect(html).toContain("invalid_type")
  })
})
