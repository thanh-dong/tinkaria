import { memo } from "react"
import { Streamdown } from "streamdown"
import remarkGfm from "remark-gfm"
import type { ProcessedTextMessage } from "./types"
import { createMarkdownComponents } from "./shared"
import { createC3UiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import { EmbedRenderer } from "../rich-content/EmbedRenderer"
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"

const LONG_MESSAGE_THRESHOLD = 800
const DIASHORT_URL_PATTERN = /https:\/\/diashort\.apps\.quickable\.co\/(?:d|e)\/[A-Za-z0-9_-]+(?:\?[^\s<]*)?/g
const PUG_FENCE_PATTERN = /(^|\n)```(pug|pugjs)\r?\n([\s\S]*?)\r?\n```(?=\n|$)/g

interface Props {
  message: ProcessedTextMessage
}

function extractDiashortUrls(text: string): string[] {
  const matches = text.match(DIASHORT_URL_PATTERN) ?? []
  return [...new Set(matches)]
}

type TextSegment =
  | { kind: "markdown"; content: string }
  | { kind: "pug"; format: "pug" | "pugjs"; source: string }

function extractTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(PUG_FENCE_PATTERN)) {
    const fullMatch = match[0]
    const leadingNewline = match[1] ?? ""
    const rawFormat = match[2]
    const source = match[3]
    if (!rawFormat || source === undefined) continue

    const start = match.index ?? 0
    const markdownEnd = start + leadingNewline.length
    const markdown = text.slice(cursor, markdownEnd)
    if (markdown) {
      segments.push({ kind: "markdown", content: markdown })
    }

    segments.push({
      kind: "pug",
      format: rawFormat === "pugjs" ? "pugjs" : "pug",
      source,
    })

    cursor = start + fullMatch.length
  }

  const trailing = text.slice(cursor)
  if (trailing) {
    segments.push({ kind: "markdown", content: trailing })
  }

  return segments.length > 0 ? segments : [{ kind: "markdown", content: text }]
}

export const TextMessage = memo(function TextMessage({ message }: Props) {
  const assistantResponseDescriptor = createC3UiIdentityDescriptor({
    id: "message.assistant.response",
    c3ComponentId: "c3-111",
    c3ComponentLabel: "messages",
  })
  const isLong = message.text.length > LONG_MESSAGE_THRESHOLD
  const diashortUrls = extractDiashortUrls(message.text)
  const segments = extractTextSegments(message.text)
  const content = (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      {segments.map((segment, index) => {
        if (segment.kind === "pug") {
          return (
            <RichContentBlock
              key={`${message.id}-pug-${index}`}
              type="embed"
              title="Pug"
              defaultExpanded
              rawContent={segment.source}
            >
              <EmbedRenderer format={segment.format} source={segment.source} />
            </RichContentBlock>
          )
        }

        return (
          <Streamdown
            key={`${message.id}-markdown-${index}`}
            components={createMarkdownComponents()}
            linkSafety={{ enabled: false }}
            remarkPlugins={[remarkGfm, remarkRichContentHint]}
          >
            {segment.content}
          </Streamdown>
        )
      })}
    </div>
  )

  return (
    <div {...getUiIdentityAttributeProps(assistantResponseDescriptor)}>
      {isLong ? (
        <RichContentBlock
          type="markdown"
          title="Response"
          defaultExpanded
          chrome="inline"
          controlsVisibility="hover-or-touch"
          bodyClassName="p-0 pr-24 sm:pr-28"
          rawContent={message.text}
        >
          {content}
        </RichContentBlock>
      ) : content}
      {diashortUrls.length > 0 ? (
        <div className="mt-4 space-y-3">
          {diashortUrls.map((url, index) => (
            <RichContentBlock
              key={`${message.id}-diashort-${index}`}
              type="embed"
              title="Embedded Diagram"
              defaultExpanded
              rawContent={url}
            >
              <EmbedRenderer format="diashort" source={url} />
            </RichContentBlock>
          ))}
        </div>
      ) : null}
    </div>
  )
})
