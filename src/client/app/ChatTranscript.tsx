import React, { lazy, Suspense, useMemo, type RefObject } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { AskUserQuestionItem, ProcessedToolCall } from "../components/messages/types"
import type { AskUserQuestionAnswerMap, HydratedTranscriptMessage } from "../../shared/types"
import { useMessageHeights } from "../lib/useMessageHeights"
import type { RenderItem } from "../lib/messageHeights"
import { RawJsonMessage } from "../components/messages/RawJsonMessage"
import { SystemMessage } from "../components/messages/SystemMessage"
import { AccountInfoMessage } from "../components/messages/AccountInfoMessage"
const TextMessage = lazy(() => import("../components/messages/TextMessage").then(m => ({ default: m.TextMessage })))
import { AskUserQuestionMessage } from "../components/messages/AskUserQuestionMessage"
import { PresentContentMessage } from "../components/messages/PresentContentMessage"
import { TodoWriteMessage } from "../components/messages/TodoWriteMessage"
import { ToolCallMessage } from "../components/messages/ToolCallMessage"
import { ResultMessage } from "../components/messages/ResultMessage"
import { InterruptedMessage } from "../components/messages/InterruptedMessage"
import { CompactBoundaryMessage, ContextClearedMessage } from "../components/messages/CompactBoundaryMessage"

// Lazy-loaded: these components import react-markdown and are only needed after chat starts
const UserMessage = lazy(() => import("../components/messages/UserMessage").then(m => ({ default: m.UserMessage })))
const ExitPlanModeMessage = lazy(() => import("../components/messages/ExitPlanModeMessage").then(m => ({ default: m.ExitPlanModeMessage })))
const CompactSummaryMessage = lazy(() => import("../components/messages/CompactSummaryMessage").then(m => ({ default: m.CompactSummaryMessage })))
import { StatusMessage } from "../components/messages/StatusMessage"
import { CollapsedToolGroup } from "../components/messages/CollapsedToolGroup"
import { WipBlock } from "../components/messages/WipBlock"
import { OpenLocalLinkProvider } from "../components/messages/shared"
import { CHAT_SELECTION_ZONE_ATTRIBUTE } from "./chatFocusPolicy"
import { SPECIAL_TOOL_NAMES } from "./derived"

function isCollapsibleToolCall(message: HydratedTranscriptMessage) {
  if (message.kind !== "tool") return false
  const toolCall = message as ProcessedToolCall
  if (toolCall.isError) return false
  return !SPECIAL_TOOL_NAMES.has(toolCall.toolName)
}

// Find the index of the "answer" assistant_text — the last one NOT followed by any tool call.
// This message renders as a full TextMessage; everything before it is narration.
function findAnswerIndex(messages: HydratedTranscriptMessage[], isLoading: boolean): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind !== "assistant_text") continue
    if (!isLoading) return i // turn done: last assistant_text is always the answer
    // live turn: only if no tool call follows
    let hasToolAfter = false
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].kind === "tool") { hasToolAfter = true; break }
    }
    if (hasToolAfter) break
    // During loading: if this is the tail message and there is any prior
    // activity (tools or other assistant_text), suppress the answer —
    // it's likely mid-turn narration that will be followed by more tools.
    // Prevents the flash where text briefly renders as a TextMessage then
    // gets absorbed into a WipBlock when the next tool arrives.
    if (i === messages.length - 1) {
      for (let j = 0; j < i; j++) {
        if (messages[j].kind === "tool" || messages[j].kind === "assistant_text") return -1
      }
    }
    return i
  }
  return -1
}

function isSpecialToolCall(message: HydratedTranscriptMessage): boolean {
  if (message.kind !== "tool") return false
  const toolCall = message as ProcessedToolCall
  return SPECIAL_TOOL_NAMES.has(toolCall.toolName)
}

function isWipAbsorbable(message: HydratedTranscriptMessage): boolean {
  return message.kind === "assistant_text" || isCollapsibleToolCall(message)
}

export function groupMessages(messages: HydratedTranscriptMessage[], isLoading: boolean): RenderItem[] {
  const result: RenderItem[] = []
  const answerIndex = findAnswerIndex(messages, isLoading)
  let index = 0

  while (index < messages.length) {
    const message = messages[index]

    // Try to start a WIP block: assistant_text that isn't the answer
    if (message.kind === "assistant_text" && index !== answerIndex) {
      const steps: HydratedTranscriptMessage[] = [message]
      const startIndex = index
      index += 1

      // Absorb consecutive narration + collapsible tools
      while (index < messages.length && index !== answerIndex && isWipAbsorbable(messages[index])) {
        steps.push(messages[index])
        index += 1
      }

      // Eject trailing assistant_text when followed by a special tool (AskUserQuestion, ExitPlanMode)
      // so the rationale/context text renders visibly above the interactive block
      const ejected: { message: HydratedTranscriptMessage; index: number }[] = []
      if (index < messages.length && isSpecialToolCall(messages[index])) {
        while (steps.length > 0 && steps[steps.length - 1].kind === "assistant_text") {
          const ejectedMsg = steps.pop()!
          ejected.unshift({ message: ejectedMsg, index: startIndex + steps.length })
        }
      }

      if (steps.length >= 2 || (isLoading && steps.length >= 1)) {
        result.push({ type: "wip-block", steps, startIndex })
      } else if (steps.length === 1) {
        result.push({ type: "single", message: steps[0], index: startIndex })
      }
      for (const e of ejected) {
        result.push({ type: "single", message: e.message, index: e.index })
      }
      continue
    }

    // Existing: group consecutive collapsible tool calls (outside narration context)
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

export function getRenderItemIndexForMessageId(renderItems: RenderItem[], messageId: string): number {
  return renderItems.findIndex((item) => {
    if (item.type === "tool-group") return item.messages.some((m) => m.id === messageId)
    if (item.type === "wip-block") return item.steps.some((m) => m.id === messageId)
    return item.message.id === messageId
  })
}

interface ChatTranscriptProps {
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

export function ChatTranscript({
  messages,
  scrollRef,
  isLoading,
  localPath,
  latestToolIds,
  onOpenLocalLink,
  onOpenExternalLink,
  onAskUserQuestionSubmit,
  onExitPlanModeConfirm,
}: ChatTranscriptProps) {
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

  const renderItems = useMemo(() => groupMessages(messages, isLoading), [messages, isLoading])

  const { estimateSize } = useMessageHeights(renderItems, scrollRef)

  const virtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
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
      <Suspense fallback={<div className="min-h-[24px]" />}>
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

          if (item.type === "wip-block") {
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
                  <WipBlock steps={item.steps} isLoading={isLoading} localPath={localPath} />
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
                  className={`group relative pb-5${isLoading && item.message.kind === "assistant_text" ? " animate-narration-guard" : ""}`}
                  {...{ [CHAT_SELECTION_ZONE_ATTRIBUTE]: "" }}
                >
                  {rendered}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      </Suspense>
    </OpenLocalLinkProvider>
  )
}
