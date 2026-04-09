import { useState, useMemo, useCallback, memo } from "react"
import { ChevronRight, MessageCircle } from "lucide-react"
import type { ProcessedToolCall } from "./types"
import type { HydratedTranscriptMessage } from "../../../shared/types"
import { MetaRow, MetaLabel, getToolIcon, getToolLabel } from "./shared"
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

function ToolStepRow({ toolName, label, className }: { toolName: string; label: string; className?: string }) {
  const Icon = getToolIcon(toolName)
  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground truncate ${className ?? ""}`}>
      <Icon className="size-3.5 text-muted-icon flex-shrink-0" />
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
          {/* Line 1: Progress header + chevron */}
          <button
            onClick={toggleExpanded}
            className={`group cursor-pointer grid grid-cols-[auto_1fr_auto] items-center gap-1.5 text-sm ${!expanded && !isLoading ? "hover:opacity-60 transition-opacity" : ""}`}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 relative flex items-center justify-center">
                <div
                  className={`w-1.5 h-1.5 rounded-full bg-[var(--logo)] ${isLoading ? "animate-wip-pulse" : "opacity-40"}`}
                />
              </div>
              <MetaLabel className="text-left text-xs text-muted-foreground">
                <AnimatedShinyText animate={isLoading} shimmerWidth={60}>
                  {stepCount > 0 ? pluralize(stepCount, "step", "steps") : "Thinking"}
                </AnimatedShinyText>
              </MetaLabel>
            </div>
            <div />
            <ChevronRight
              className={`h-4 w-4 text-muted-icon transition-all duration-200 ${expanded ? "rotate-90" : ""}`}
            />
          </button>

          {/* Line 2: Latest thinking (only if exists) */}
          {latestNarration ? (
            <div className="ml-[26px] text-xs text-muted-foreground/70 truncate italic">
              {latestNarration.length > 120 ? `${latestNarration.slice(0, 120)}...` : latestNarration}
            </div>
          ) : null}

          {/* Line 3: Latest action (only if exists) */}
          {latestTool && toolLabel ? (
            <ToolStepRow toolName={latestTool.toolName} label={toolLabel} className="ml-[26px]" />
          ) : null}

          {/* Expanded: timeline tree */}
          {expanded ? (
            <div className="ml-[10px] mt-2 mb-1 border-l border-muted-foreground/15 pl-4 flex flex-col gap-1">
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
                    <ToolStepRow key={step.id} toolName={toolMsg.toolName} label={getToolLabel(toolMsg, localPath)} />
                  )
                }
                return null
              })}
            </div>
          ) : null}
        </div>
      </MetaRow>
    </div>
  )
})
