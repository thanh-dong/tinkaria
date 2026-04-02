import { memo, type ReactNode } from "react"
import { Streamdown } from "streamdown"
import remarkGfm from "remark-gfm"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { createMarkdownComponents } from "./shared"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import { EmbedRenderer, isEmbedLanguage } from "../rich-content/EmbedRenderer"
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"
import type { ProcessedPresentContentMessage } from "./types"
import type { PresentContentSuccessToolResult } from "../../../shared/types"

interface Props {
  message: ProcessedPresentContentMessage
}

type PresentContentResult = NonNullable<ProcessedPresentContentMessage["result"]>

function isPresentContentErrorResult(
  result: PresentContentResult
): result is Extract<PresentContentResult, { error: unknown }> {
  return "error" in result
}

function getResolvedContent(message: ProcessedPresentContentMessage): PresentContentSuccessToolResult {
  if (message.result && !isPresentContentErrorResult(message.result)) {
    return message.result
  }

  return {
    accepted: true as const,
    title: message.input.title,
    kind: message.input.kind,
    format: message.input.format,
    source: message.input.source,
    summary: message.input.summary,
    collapsed: message.input.collapsed,
  }
}

function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      <Streamdown
        components={createMarkdownComponents()}
        linkSafety={{ enabled: false }}
        remarkPlugins={[remarkGfm, remarkRichContentHint]}
      >
        {source}
      </Streamdown>
    </div>
  )
}

function CodeBody({ source }: { source: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
      {source}
    </pre>
  )
}

function Summary({ summary }: { summary?: string }) {
  if (!summary) return null

  return (
    <p className="text-xs leading-5 text-muted-foreground">
      {summary}
    </p>
  )
}

function renderSuccessContent(content: Extract<PresentContentResult, { accepted: true }>): ReactNode {
  const displayTitle = content.title || "Content"
  const defaultExpanded = content.collapsed !== true
  const summary = <Summary summary={content.summary} />

  if (content.format === "markdown" || content.kind === "markdown") {
    return (
      <RichContentBlock
        type="markdown"
        title={displayTitle}
        defaultExpanded={defaultExpanded}
        rawContent={content.source}
      >
        <div className="space-y-3">
          {summary}
          <MarkdownBody source={content.source} />
        </div>
      </RichContentBlock>
    )
  }

  if (isEmbedLanguage(content.format)) {
    return (
      <RichContentBlock
        type="embed"
        title={displayTitle}
        defaultExpanded={defaultExpanded}
        rawContent={content.source}
      >
        <div className="space-y-3">
          {summary}
          <EmbedRenderer format={content.format} source={content.source} />
        </div>
      </RichContentBlock>
    )
  }

  return (
    <RichContentBlock
      type="code"
      title={displayTitle}
      defaultExpanded={defaultExpanded}
      rawContent={content.source}
    >
      <div className="space-y-3">
        {summary}
        <CodeBody source={content.source} />
      </div>
    </RichContentBlock>
  )
}

function renderErrorContent(message: ProcessedPresentContentMessage) {
  if (!message.result || !isPresentContentErrorResult(message.result)) {
    return null
  }

  const error = message.result.error
  const prettyError = JSON.stringify(error, null, 2)

  return (
    <RichContentBlock
      type="code"
      title={message.input.title || "Content"}
      defaultExpanded
      rawContent={prettyError}
    >
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="font-medium">Present content validation failed</div>
          <div className="mt-1 text-muted-foreground">
            source: <span className="font-mono text-foreground">{error.source}</span>, schema:{" "}
            <span className="font-mono text-foreground">{error.schema}</span>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
          {prettyError}
        </pre>
      </div>
    </RichContentBlock>
  )
}

export const PresentContentMessage = memo(function PresentContentMessage({ message }: Props) {
  return (
    <div {...getUiIdentityAttributeProps("message.present_content.item")}>
      {message.result && isPresentContentErrorResult(message.result) ? (
        renderErrorContent(message)
      ) : (
        renderSuccessContent(getResolvedContent(message))
      )}
    </div>
  )
})
