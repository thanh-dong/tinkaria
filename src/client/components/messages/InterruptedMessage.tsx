import { memo } from "react"
import { CircleSlash } from "lucide-react"
import type { ProcessedInterruptedMessage } from "./types"

interface Props {
  message: ProcessedInterruptedMessage
}

export const InterruptedMessage = memo(function InterruptedMessage({ message: _message }: Props) {
  return (
    <div className="flex flex-col items-end gap-1.5 text-sm text-muted-foreground my-3">
      <div className="inline-flex gap-1.5 items-center justify-center whitespace-nowrap text-sm font-medium bg-background text-foreground/60 border border-border h-9 pl-1 pr-4 rounded-full">
        <CircleSlash className="h-4 w-4 ml-1.5" />
        <em>Interrupted</em>
      </div>
      <span className="text-xs text-muted-foreground/60 pr-1">
        Send a new message to continue this conversation.
      </span>
    </div>
  )
})
