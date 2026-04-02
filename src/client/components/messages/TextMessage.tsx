import { memo } from "react"
import { Streamdown } from "streamdown"
import remarkGfm from "remark-gfm"
import type { ProcessedTextMessage } from "./types"
import { createMarkdownComponents } from "./shared"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"

const LONG_MESSAGE_THRESHOLD = 800

interface Props {
  message: ProcessedTextMessage
}

export const TextMessage = memo(function TextMessage({ message }: Props) {
  const isLong = message.text.length > LONG_MESSAGE_THRESHOLD
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
    <div {...getUiIdentityAttributeProps("message.assistant.response")}>
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
    </div>
  )
})
