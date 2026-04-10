import { useState, useMemo, useCallback, memo } from "react"
import { ChevronRight } from "lucide-react"
import type { ProcessedToolCall } from "./types"
import type { HydratedTranscriptMessage } from "../../../shared/types"
import { MetaRow, MetaLabel } from "./shared"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import { ToolCallMessage } from "./ToolCallMessage"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"

const WIP_BLOCK_DESCRIPTOR = createUiIdentityDescriptor({
  id: "message.wip-block.area",
  c3ComponentId: "c3-111",
  c3ComponentLabel: "messages",
})

interface Props {
  steps: HydratedTranscriptMessage[]
  isLoading: boolean
  localPath?: string | null
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Extract the last assistant_text as the current work-step goal */
function extractGoal(steps: HydratedTranscriptMessage[]): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.kind === "assistant_text" && step.text.trim()) {
      const text = step.text.trim()
      return text.length > 120 ? `${text.slice(0, 120)}…` : text
    }
  }
  return "Thinking"
}

export const WipBlock = memo(function WipBlock({ steps, isLoading, localPath }: Props) {
  const [expanded, setExpanded] = useState(false)
  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), [])

  const { stepCount, goal, toolSteps } = useMemo(() => {
    const tools: HydratedTranscriptMessage[] = []
    for (const step of steps) {
      if (step.kind === "tool") tools.push(step)
    }
    return { stepCount: tools.length, goal: extractGoal(steps), toolSteps: tools }
  }, [steps])

  return (
    <div {...getUiIdentityAttributeProps(WIP_BLOCK_DESCRIPTOR)}>
      <MetaRow className="w-full">
        <div className="flex flex-col w-full">
          {/* Header: current goal + step count */}
          <button
            onClick={toggleExpanded}
            className={`group cursor-pointer grid grid-cols-[auto_1fr] items-center gap-1 text-sm ${!expanded && !isLoading ? "hover:opacity-60 transition-opacity" : ""}`}
          >
            <div className="grid grid-cols-[auto_1fr] items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 relative flex items-center justify-center">
                <ChevronRight
                  className={`h-4.5 w-4.5 transition-all duration-200 ${isLoading ? "text-[var(--logo)] animate-pulse" : "text-muted-icon"} ${expanded ? "rotate-90" : ""}`}
                />
              </div>
              <div className="flex items-baseline gap-2 min-w-0">
                <MetaLabel className={`text-left truncate min-w-0 ${isLoading ? "" : "text-muted-foreground"}`}>
                  <AnimatedShinyText animate={isLoading} shimmerWidth={60}>
                    {goal}
                  </AnimatedShinyText>
                </MetaLabel>
                {stepCount > 0 ? (
                  <span className="text-xs text-muted-foreground/50 flex-shrink-0 tabular-nums">
                    {pluralize(stepCount, "step", "steps")}
                  </span>
                ) : null}
              </div>
            </div>
          </button>

          {/* Expanded: reuse ToolCallMessage for each tool step */}
          {expanded && toolSteps.length > 0 ? (
            <div className="my-4 flex flex-col gap-3">
              {toolSteps.map((step) => (
                <ToolCallMessage
                  key={step.id}
                  message={step as ProcessedToolCall}
                  isLoading={isLoading}
                  localPath={localPath}
                />
              ))}
            </div>
          ) : null}
        </div>
      </MetaRow>
    </div>
  )
})
