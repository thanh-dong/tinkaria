import { Loader2, AlertCircle } from "lucide-react"
import { MetaRow, MetaContent } from "./shared"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import { Button } from "../ui/button"
import { useTranscriptActions } from "../../app/TranscriptActionsContext"

const STATUS_LABELS: Record<string, string> = {
  connecting: "Connecting...",
  acquiring_sandbox: "Booting...",
  initializing: "Initializing...",
  starting: "Starting...",
  running: "Running...",
  waiting_for_user: "Waiting...",
  failed: "Failed",
}

interface ProcessingMessageProps {
  status?: string
}

export function ProcessingMessage({ status }: ProcessingMessageProps) {
  const actions = useTranscriptActions()
  const label = (status ? STATUS_LABELS[status] : undefined) || "Processing..."
  const isFailed = status === "failed"

  if (isFailed) {
    return (
      <div className="px-4 py-3 mx-2 my-1 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-4.5 text-destructive mt-0.5 flex-shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-medium text-destructive">Session failed to start</span>
            <span className="text-muted-foreground text-xs">The CLI process exited before it could respond.</span>
            <div className="flex gap-2 mt-1.5">
              <Button variant="ghost" size="sm" onClick={actions?.onRetryChat}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={actions?.onDismissError}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <MetaRow className="ml-[1px]">
      <MetaContent>
        <Loader2 className="size-4.5 animate-spin text-muted-icon" />
        <AnimatedShinyText className="ml-[1px] text-sm" shimmerWidth={44}>
          {label}
        </AnimatedShinyText>
      </MetaContent>
    </MetaRow>
  )
}
