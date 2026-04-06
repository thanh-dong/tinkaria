import React, { useMemo, type RefObject } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { AskUserQuestionItem, ProcessedToolCall } from "../components/messages/types"
import type { AskUserQuestionAnswerMap, HydratedTranscriptMessage } from "../../shared/types"
import { UserMessage } from "../components/messages/UserMessage"
import { RawJsonMessage } from "../components/messages/RawJsonMessage"
import { SystemMessage } from "../components/messages/SystemMessage"
import { AccountInfoMessage } from "../components/messages/AccountInfoMessage"
import { TextMessage } from "../components/messages/TextMessage"
import { AskUserQuestionMessage } from "../components/messages/AskUserQuestionMessage"
import { ExitPlanModeMessage } from "../components/messages/ExitPlanModeMessage"
import { PresentContentMessage } from "../components/messages/PresentContentMessage"
import { TodoWriteMessage } from "../components/messages/TodoWriteMessage"
import { ToolCallMessage } from "../components/messages/ToolCallMessage"
import { ResultMessage } from "../components/messages/ResultMessage"
import { InterruptedMessage } from "../components/messages/InterruptedMessage"
import { CompactBoundaryMessage, ContextClearedMessage } from "../components/messages/CompactBoundaryMessage"
import { CompactSummaryMessage } from "../components/messages/CompactSummaryMessage"
import { StatusMessage } from "../components/messages/StatusMessage"
import { CollapsedToolGroup } from "../components/messages/CollapsedToolGroup"
import { OpenLocalLinkProvider } from "../components/messages/shared"
import { CHAT_SELECTION_ZONE_ATTRIBUTE } from "./chatFocusPolicy"
import { SPECIAL_TOOL_NAMES } from "./derived"

type RenderItem =
  | { type: "single"; message: HydratedTranscriptMessage; index: number }
  | { type: "tool-group"; messages: HydratedTranscriptMessage[]; startIndex: number }

function isCollapsibleToolCall(message: HydratedTranscriptMessage) {
  if (message.kind !== "tool") return false
  const toolName = (message as ProcessedToolCall).toolName
  return !SPECIAL_TOOL_NAMES.has(toolName)
}

function groupMessages(messages: HydratedTranscriptMessage[]): RenderItem[] {
  const result: RenderItem[] = []
  let index = 0

  while (index < messages.length) {
    const message = messages[index]
    if (isCollapsibleToolCall(message)) {
      const group: HydratedTranscriptMessage[] = [message]
      const startIndex = index
      index += 1
      while (index < messages.length && isCollapsibleToolCall(messages[index])) {
        group.push(messages[index])
        index += 1
      }
      if (group.length >= 2) {
        result.push({ type: "tool-group", messages: group, startIndex })
      } else {
        result.push({ type: "single", message, index: startIndex })
      }
      continue
    }

    result.push({ type: "single", message, index })
    index += 1
  }

  return result
}

interface TinkariaTranscriptProps {
  messages: HydratedTranscriptMessage[]
  scrollRef: RefObject<HTMLDivElement | null>
  isLoading: boolean
  localPath?: string
  latestToolIds: Record<string, string | null>
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
  onOpenExternalLink: (href: string) => boolean
  onAskUserQuestionSubmit: (
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) => void
  onExitPlanModeConfirm: (toolUseId: string, confirmed: boolean, clearContext?: boolean, message?: string) => void
}

export function TinkariaTranscript({
  messages,
  scrollRef,
  isLoading,
  localPath,
  latestToolIds,
  onOpenLocalLink,
  onOpenExternalLink,
  onAskUserQuestionSubmit,
  onExitPlanModeConfirm,
}: TinkariaTranscriptProps) {
  // Precompute first-occurrence indices to avoid O(n) findIndex per render
  const firstIndices = useMemo(() => {
    let systemInit = -1
    let accountInfo = -1
    for (let i = 0; i < messages.length; i++) {
      if (systemInit === -1 && messages[i].kind === "system_init") systemInit = i
      if (accountInfo === -1 && messages[i].kind === "account_info") accountInfo = i
      if (systemInit !== -1 && accountInfo !== -1) break
    }
    return { systemInit, accountInfo }
  }, [messages])

  const renderItems = useMemo(() => groupMessages(messages), [messages])

  const virtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  function renderMessage(message: HydratedTranscriptMessage, index: number): React.ReactNode {
    if (message.kind === "user_prompt") {
      return <UserMessage key={message.id} content={message.content} />
    }

    switch (message.kind) {
      case "unknown":
        return <RawJsonMessage key={message.id} json={message.json} />
      case "system_init":
        return firstIndices.systemInit === index
          ? <SystemMessage key={message.id} message={message} rawJson={message.debugRaw} />
          : null
      case "account_info":
        return firstIndices.accountInfo === index
          ? <AccountInfoMessage key={message.id} message={message} />
          : null
      case "assistant_text":
        return <TextMessage key={message.id} message={message} />
      case "tool":
        if (message.toolKind === "ask_user_question") {
          return (
            <AskUserQuestionMessage
              key={message.id}
              message={message}
              onSubmit={onAskUserQuestionSubmit}
              isLatest={message.id === latestToolIds.AskUserQuestion}
            />
          )
        }
        if (message.toolKind === "exit_plan_mode") {
          return (
            <ExitPlanModeMessage
              key={message.id}
              message={message}
              onConfirm={onExitPlanModeConfirm}
              isLatest={message.id === latestToolIds.ExitPlanMode}
            />
          )
        }
        if (message.toolKind === "todo_write") {
          if (message.id !== latestToolIds.TodoWrite) return null
          return <TodoWriteMessage key={message.id} message={message} />
        }
        if (message.toolKind === "present_content") {
          return <PresentContentMessage key={message.id} message={message} />
        }
        return (
          <ToolCallMessage
            key={message.id}
            message={message}
            isLoading={isLoading}
            localPath={localPath}
          />
        )
      case "result": {
        const nextMessage = messages[index + 1]
        const previousMessage = messages[index - 1]
        if (nextMessage?.kind === "context_cleared" || previousMessage?.kind === "context_cleared") {
          return null
        }
        return <ResultMessage key={message.id} message={message} />
      }
      case "interrupted":
        return <InterruptedMessage key={message.id} message={message} />
      case "compact_boundary":
        return <CompactBoundaryMessage key={message.id} />
      case "context_cleared":
        return <ContextClearedMessage key={message.id} />
      case "compact_summary":
        return <CompactSummaryMessage key={message.id} message={message} />
      case "status":
        return index === messages.length - 1 ? <StatusMessage key={message.id} message={message} /> : null
    }
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <OpenLocalLinkProvider onOpenLocalLink={onOpenLocalLink} onOpenExternalLink={onOpenExternalLink}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = renderItems[virtualRow.index]

          if (item.type === "tool-group") {
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="group relative pb-5"
                  {...{ [CHAT_SELECTION_ZONE_ATTRIBUTE]: "" }}
                >
                  <CollapsedToolGroup messages={item.messages} isLoading={isLoading} localPath={localPath} />
                </div>
              </div>
            )
          }

          const rendered = renderMessage(item.message, item.index)

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rendered ? (
                <div
                  id={`msg-${item.message.id}`}
                  className="group relative pb-5"
                  {...{ [CHAT_SELECTION_ZONE_ATTRIBUTE]: "" }}
                >
                  {rendered}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </OpenLocalLinkProvider>
  )
}
