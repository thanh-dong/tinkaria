import { createContext, useContext } from "react"

export interface TranscriptActions {
  onRetryChat: () => void
  onNewChat: () => void
  onResumeSession: (() => void) | null
  onDismissError: () => void
  onRetryBootstrap: (() => void) | null
}

export const TranscriptActionsContext = createContext<TranscriptActions | null>(null)

export function useTranscriptActions(): TranscriptActions | null {
  return useContext(TranscriptActionsContext)
}
