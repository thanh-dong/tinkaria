import { UserRound, X, Check, CircleAlert } from "lucide-react"
import type { ProcessedToolCall } from "./types"
import { MetaRow, MetaLabel, MetaCodeBlock, ExpandableRow, VerticalLineContainer, getToolIcon, getToolLabel } from "./shared"
import { memo, useMemo } from "react"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import { FileContentView } from "./FileContentView"
import { ImageContentView } from "./ImageContentView"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { isReadFileImageResult } from "../../../shared/types"

const SOFT_ERROR_PATTERNS = [
  "no files found",
  "no matches",
  "no results",
  "exit code 1",
  "not found",
  "no such file",
]

function isSoftError(result: unknown): boolean {
  const text = typeof result === "string" ? result : ""
  if (!text) return false
  const lower = text.toLowerCase()
  return SOFT_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))
}

const TOOL_CALL_ITEM_DESCRIPTOR = createUiIdentityDescriptor({
  id: "message.tool-call.item",
  c3ComponentId: "c3-111",
  c3ComponentLabel: "messages",
})

interface Props {
  message: ProcessedToolCall
  isLoading?: boolean
  localPath?: string | null
}

export const ToolCallMessage = memo(function ToolCallMessage({ message, isLoading = false, localPath }: Props) {
  const hasResult = message.result !== undefined
  const showLoadingState = !hasResult && isLoading

  const name = useMemo(() => getToolLabel(message, localPath), [message.input, message.toolName, localPath])

  const isAgent = useMemo(() => message.toolKind === "subagent_task", [message.toolKind])
  const description = useMemo(() => {
    if (message.toolKind === "skill") {
      return message.input.skill
    }
  }, [message.input, message.toolKind])

  const isBashTool = message.toolKind === "bash"
  const isWriteTool = message.toolKind === "write_file"
  const isEditTool = message.toolKind === "edit_file"
  const isReadTool = message.toolKind === "read_file"

  const resultText = useMemo(() => {
    if (typeof message.result === "string") return message.result
    if (!message.result) return ""
    if (isReadFileImageResult(message.result)) return message.result.text ?? ""
    if (typeof message.result === "object" && message.result !== null && "content" in message.result) {
      const content = (message.result as { content?: unknown }).content
      if (typeof content === "string") return content
    }
    return JSON.stringify(message.result, null, 2)
  }, [message.result])

  const inputText = useMemo(() => {
    switch (message.toolKind) {
      case "bash":
        return message.input.command
      case "write_file":
        return message.input.content
      default:
        return JSON.stringify(message.input, null, 2)
    }
  }, [message])

  const imageResult = isReadFileImageResult(message.result) ? message.result : null
  const showGenericResult = hasResult && !isReadTool && !(!message.isError && (isWriteTool || isEditTool))

  return (
    <div {...getUiIdentityAttributeProps(TOOL_CALL_ITEM_DESCRIPTOR)}>
    <MetaRow className="w-full">
      <ExpandableRow
        expandedContent={
          <VerticalLineContainer className="my-4 text-sm">
            <div className="flex flex-col gap-2">
              {isEditTool ? (
                <FileContentView
                  content=""
                  isDiff
                  oldString={message.input.oldString}
                  newString={message.input.newString}
                />
              ) : !isReadTool && !isWriteTool && (
                <MetaCodeBlock label={
                  isBashTool ? (
                    <span className="flex items-center gap-2 w-full">
                      <span>Command</span>
                      {!!message.input.timeoutMs && (
                        <span className="text-muted-foreground">timeout: {String(message.input.timeoutMs)}ms</span>
                      )}
                      {!!message.input.runInBackground && (
                        <span className="text-muted-foreground">background</span>
                      )}
                    </span>
                  ) : "Input"
                } copyText={inputText}>
                  {inputText}
                </MetaCodeBlock>
              )}
              {hasResult && isReadTool && !message.isError && (
                imageResult ? (
                  <ImageContentView
                    images={imageResult.images}
                    text={imageResult.text}
                    title={message.input.filePath}
                  />
                ) : (
                  <FileContentView content={resultText} />
                )
              )}
              {isWriteTool && !message.isError && (
                <FileContentView content={message.input.content} />
              )}
              {showGenericResult && (
                imageResult ? (
                  <ImageContentView
                    images={imageResult.images}
                    text={imageResult.text}
                  />
                ) : (
                  <MetaCodeBlock label={message.isError ? "Error" : "Result"} copyText={resultText}>
                    {resultText}
                  </MetaCodeBlock>
                )
              )}
            </div>
          </VerticalLineContainer>
        }
      >

        <div className="w-5 h-5 relative flex items-center justify-center">
          {(() => {
            if (message.isError) {
              if (isSoftError(message.result)) {
                return <CircleAlert className="size-3.5 text-muted-foreground/50" />
              }
              return <X className="size-4 text-destructive" />
            }
            if (showLoadingState) {
              if (isAgent) return <UserRound className="size-4 text-[var(--logo)] animate-pulse" />
              const Icon = getToolIcon(message.toolName)
              return <Icon className="size-4 text-[var(--logo)] animate-pulse" />
            }
            if (hasResult) {
              return <Check className="size-3.5 text-muted-foreground/40" />
            }
            if (isAgent) return <UserRound className="size-4 text-muted-icon" />
            const Icon = getToolIcon(message.toolName)
            return <Icon className="size-4 text-muted-icon" />
          })()}
        </div>
        <MetaLabel className={`text-left transition-opacity duration-200 truncate ${hasResult && !showLoadingState ? "text-muted-foreground" : ""}`}>
          <AnimatedShinyText
            animate={showLoadingState}
            shimmerWidth={Math.max(20, ((description || name)?.length ?? 33) * 3)}
          >
            {description || name}
          </AnimatedShinyText>
        </MetaLabel>



      </ExpandableRow>
    </MetaRow>
    </div>
  )
})
