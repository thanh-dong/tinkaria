import { useState, useMemo, useCallback, memo } from "react"
import { ChevronRight, MessageCircle, X } from "lucide-react"
import type { ProcessedToolCall } from "./types"
import type { HydratedTranscriptMessage } from "../../../shared/types"
import { MetaRow, MetaLabel, VerticalLineContainer, getToolIcon, getToolLabel } from "./shared"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
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

function ToolStepRow({ toolName, label, isError, className }: { toolName: string; label: string; isError?: boolean; className?: string }) {
  const Icon = isError ? X : getToolIcon(toolName)
  return (
    <div className={`flex items-center gap-1.5 text-xs truncate ${isError ? "text-destructive" : "text-muted-foreground"} ${className ?? ""}`}>
      <Icon className={`size-3.5 flex-shrink-0 ${isError ? "text-destructive" : "text-muted-icon"}`} />
      <span className="truncate">{label}</span>
    </div>
  )
}

export const WipBlock = memo(function WipBlock({ steps, isLoading, localPath }: Props) {
  const [expanded, setExpanded] = useState(false)
  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), [])

  // Derive collapsed state from steps
  const { latestNarration, latestTool, stepCount } = useMemo(() => {
    let narration: string | null = null
    let tool: ProcessedToolCall | null = null
    let count = 0

    for (const step of steps) {
      if (step.kind === "assistant_text") {
        narration = step.text
      } else if (step.kind === "tool") {
        tool = step as ProcessedToolCall
        count++
      }
    }

    return { latestNarration: narration, latestTool: tool, stepCount: count }
  }, [steps])

  const toolLabel = useMemo(
    () => latestTool ? getToolLabel(latestTool, localPath) : null,
    [latestTool, localPath],
  )

  return (
    <div {...getUiIdentityAttributeProps(WIP_BLOCK_DESCRIPTOR)}>
      <MetaRow className="w-full">
        <div className="flex flex-col w-full">
          {/* Header: chevron-left layout matching CollapsedToolGroup */}
          <button
            onClick={toggleExpanded}
            className={`group cursor-pointer grid grid-cols-[auto_1fr] items-center gap-1 text-sm ${!expanded && !isLoading ? "hover:opacity-60 transition-opacity" : ""}`}
          >
            <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
              <div className="w-5 h-5 relative flex items-center justify-center">
                <ChevronRight
                  className={`h-4.5 w-4.5 transition-all duration-200 ${isLoading ? "text-[var(--logo)] animate-pulse" : "text-muted-icon"} ${expanded ? "rotate-90" : ""}`}
                />
              </div>
              <MetaLabel className="text-left">
                <AnimatedShinyText animate={isLoading} shimmerWidth={60}>
                  {stepCount > 0 ? pluralize(stepCount, "step", "steps") : "Thinking"}
                </AnimatedShinyText>
              </MetaLabel>
            </div>
          </button>

          {/* Sub-line: single preview — narration preferred, tool as fallback */}
          {!expanded && latestNarration ? (
            <div className="ml-[26px] mt-1 text-xs text-muted-foreground/50 truncate italic">
              {latestNarration.length > 120 ? `${latestNarration.slice(0, 120)}...` : latestNarration}
            </div>
          ) : !expanded && latestTool && toolLabel ? (
            <div className="ml-[26px] mt-1">
              <ToolStepRow toolName={latestTool.toolName} label={toolLabel} isError={latestTool.isError} />
            </div>
          ) : null}

          {/* Expanded: timeline using VerticalLineContainer */}
          {expanded ? (
            <VerticalLineContainer className="mt-2">
              <div className="flex flex-col gap-1.5 py-1">
                {steps.map((step) => {
                  if (step.kind === "assistant_text") {
                    return (
                      <div key={step.id} className="flex items-start gap-1.5 text-xs">
                        <MessageCircle className="size-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground/60 italic truncate">
                          {step.text.length > 140 ? `${step.text.slice(0, 140)}...` : step.text}
                        </span>
                      </div>
                    )
                  }
                  if (step.kind === "tool") {
                    const toolMsg = step as ProcessedToolCall
                    return (
                      <ToolStepRow key={step.id} toolName={toolMsg.toolName} label={getToolLabel(toolMsg, localPath)} isError={toolMsg.isError} />
                    )
                  }
                  return null
                })}
              </div>
            </VerticalLineContainer>
          ) : null}
        </div>
      </MetaRow>
    </div>
  )
})
