import { memo } from "react"
import { CircleSlash, AlertCircle } from "lucide-react"
import type { ProcessedResultMessage } from "./types"
import { MetaRow, MetaLabel } from "./shared"
import { Button } from "../ui/button"
import { useTranscriptActions } from "../../app/TranscriptActionsContext"

function getResultErrorHint(result: string | undefined): string {
  if (!result) return "This usually means the CLI process crashed or was killed."
  const lower = result.toLowerCase()
  if (lower.includes("signal")) return "The process was interrupted by a system signal."
  if (lower.includes("oom") || lower.includes("out of memory")) return "The process ran out of memory."
  return "This usually means the CLI process crashed or was killed."
}

interface Props {
  message: ProcessedResultMessage
}

export const ResultMessage = memo(function ResultMessage({ message }: Props) {
  const actions = useTranscriptActions()

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`
    }

    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`
    }

    if (minutes > 0) {
      return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`
    }

    return `${seconds}s`
  }

  if (message.cancelled) {
    return (
      <div className="flex flex-col items-end gap-1.5 text-sm text-muted-foreground my-3">
        <div className="inline-flex gap-1.5 items-center justify-center whitespace-nowrap text-sm font-medium bg-background text-foreground/60 border border-border h-9 pl-1 pr-4 rounded-full">
          <CircleSlash className="h-4 w-4 ml-1.5" />
          <em>Interrupted</em>
        </div>
        <span className="text-xs text-muted-foreground/60 pr-1">Send a new message to continue this conversation.</span>
      </div>
    )
  }

  if (!message.success) {
    return (
      <div className="px-4 py-3 mx-2 my-1 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-4.5 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-medium text-destructive">Session ended unexpectedly</span>
            <span className="text-muted-foreground text-xs">{getResultErrorHint(message.result)}</span>
            {message.result && (
              <code className="text-xs text-muted-foreground/70 font-mono mt-0.5">{message.result}</code>
            )}
            <div className="flex gap-2 mt-1.5">
              <Button variant="default" size="sm" onClick={actions?.onNewChat}>
                Start new chat
              </Button>
              {actions?.onResumeSession && (
                <Button variant="ghost" size="sm" onClick={actions.onResumeSession}>
                  Resume session
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MetaRow className={`px-0.5 text-xs tracking-wide ${message.durationMs > 60000 ? '' : 'hidden'}`}>
      <div className="w-full h-[1px] bg-border"></div>
      <MetaLabel className="whitespace-nowrap text-[11px] tracking-widest text-muted-foreground/60 uppercase flex-shrink-0">Worked for {formatDuration(message.durationMs)}</MetaLabel>
      <div className="w-full h-[1px] bg-border"></div>
    </MetaRow>
  )
})
