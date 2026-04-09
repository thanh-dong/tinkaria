import { memo } from "react"
import { Streamdown } from "streamdown"
import remarkGfm from "remark-gfm"
import type { ProcessedTextMessage } from "./types"
import { createMarkdownComponents } from "./shared"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import { EmbedRenderer } from "../rich-content/EmbedRenderer"
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"

const LONG_MESSAGE_THRESHOLD = 800
const DIASHORT_URL_PATTERN = /https:\/\/diashort\.apps\.quickable\.co\/(?:d|e)\/[A-Za-z0-9_-]+(?:\?[^\s<]*)?/g

interface Props {
  message: ProcessedTextMessage
}

function extractDiashortUrls(text: string): string[] {
  const matches = text.match(DIASHORT_URL_PATTERN) ?? []
  return [...new Set(matches)]
}

export const TextMessage = memo(function TextMessage({ message }: Props) {
  const assistantResponseDescriptor = createUiIdentityDescriptor({
    id: "message.assistant.response",
    c3ComponentId: "c3-111",
    c3ComponentLabel: "transcript-surfaces",
  })
  const isLong = message.text.length > LONG_MESSAGE_THRESHOLD
  const diashortUrls = extractDiashortUrls(message.text)
  const content = (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      <Streamdown
        components={createMarkdownComponents()}
        linkSafety={{ enabled: false }}
        remarkPlugins={[remarkGfm, remarkRichContentHint]}
      >
        {message.text}
      </Streamdown>
    </div>
  )

  return (
    <div {...getUiIdentityAttributeProps(assistantResponseDescriptor)}>
      {isLong ? (
        <RichContentBlock
          type="markdown"
          title="Response"
          defaultExpanded
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
