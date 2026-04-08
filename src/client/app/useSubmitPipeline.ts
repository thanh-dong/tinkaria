import { useRef, useState } from "react"
import { useChatInputStore } from "../stores/chatInputStore"
import {
  clearQueuedSubmit,
  createSubmitPipelineState,
  getQueuedText,
  type SubmitPipelineState,
} from "./useAppState.machine"

export function useSubmitPipeline(args: {
  activeChatId: string | null
}): {
  submitPipelineRef: React.MutableRefObject<SubmitPipelineState>
  submitPipeline: SubmitPipelineState
  activeQueuedText: string
  updateSubmitPipeline: (updater: (current: SubmitPipelineState) => SubmitPipelineState) => SubmitPipelineState
  clearQueuedText: () => void
  restoreQueuedText: () => string
} {
  const { activeChatId } = args

  const submitPipelineRef = useRef<SubmitPipelineState>(createSubmitPipelineState({
    queuedTextByChat: Object.fromEntries(
      Object.entries(useChatInputStore.getState().queuedDrafts).map(([chatId, draft]) => [chatId, draft.text])
    ),
    optionsByChat: Object.fromEntries(
      Object.entries(useChatInputStore.getState().queuedDrafts).map(([chatId, draft]) => [chatId, draft.options])
    ),
  }))
  const [submitPipeline, setSubmitPipeline] = useState<SubmitPipelineState>(submitPipelineRef.current)

  const activeQueuedText = getQueuedText(submitPipeline, activeChatId)

  function updateSubmitPipeline(updater: (current: SubmitPipelineState) => SubmitPipelineState): SubmitPipelineState {
    const next = updater(submitPipelineRef.current)
    submitPipelineRef.current = next
    setSubmitPipeline(next)
    useChatInputStore.getState().syncQueuedDrafts(
      Object.fromEntries(
        Object.entries(next.queuedTextByChat).flatMap(([chatId, text]) => {
          const trimmed = text.trim()
          if (!trimmed) return []
          return [[chatId, {
            text: trimmed,
            updatedAt: Date.now(),
            options: next.optionsByChat[chatId],
          }]]
        })
      )
    )
    return next
  }

  function clearQueuedText() {
    if (!activeChatId) return
    updateSubmitPipeline((current) => clearQueuedSubmit(current, activeChatId))
  }

  function restoreQueuedText(): string {
    const restored = activeQueuedText
    if (!activeChatId) return restored
    updateSubmitPipeline((current) => clearQueuedSubmit(current, activeChatId))
    return restored
  }

  return {
    submitPipelineRef,
    submitPipeline,
    activeQueuedText,
    updateSubmitPipeline,
    clearQueuedText,
    restoreQueuedText,
  }
}
