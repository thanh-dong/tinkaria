import { memo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ProcessedTextMessage } from "./types"
import { createMarkdownComponents } from "./shared"
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
      <Markdown remarkPlugins={[remarkGfm, remarkRichContentHint]} components={createMarkdownComponents()}>
        {message.text}
      </Markdown>
    </div>
  )

  if (isLong) {
    return (
      <RichContentBlock
        type="markdown"
        title="Response"
        defaultExpanded
        rawContent={message.text}
      >
        {content}
      </RichContentBlock>
    )
  }

  return content
})
