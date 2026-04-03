import { memo } from "react"
import { CircleSlash } from "lucide-react"
import type { ProcessedResultMessage } from "./types"
import { MetaRow, MetaLabel } from "./shared"

interface Props {
  message: ProcessedResultMessage
}

export const ResultMessage = memo(function ResultMessage({ message }: Props) {
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
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground my-3">
        <div className="inline-flex gap-1.5 items-center justify-center whitespace-nowrap text-sm font-medium bg-background text-foreground/60 border border-border h-9 pl-1 pr-4 rounded-full">
          <CircleSlash className="h-4 w-4 ml-1.5" />
          <em>Interrupted</em>
        </div>
      </div>
    )
  }

  if (!message.success) {
    return (
      <div className="px-4 py-3 mx-2 my-1 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
        {message.result || "The session ended unexpectedly."}
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
