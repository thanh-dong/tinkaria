import { memo, useMemo } from "react"
import { Sparkles, ChevronRight } from "lucide-react"
import type { AgentProvider } from "../../../shared/types"
import { cn } from "../../lib/utils"
import { createUiIdentity, createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { sortSkillsByFrequency, formatSkillCommand, useSkillCompositionStore } from "../../stores/skillCompositionStore"

const SKILL_RIBBON_UI_DESCRIPTORS = {
  ribbon: createUiIdentityDescriptor({
    id: "chat.composer.skills.ribbon",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  toggle: createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.skills.toggle", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  skillButton: createUiIdentityDescriptor({
    id: createUiIdentity("chat.composer.skills.insert", "action"),
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
}

interface SkillRibbonProps {
  skills: string[]
  provider: AgentProvider
  visible: boolean
  onToggle: () => void
  onInsert: (skill: string) => void
  showToggle?: boolean
  showContent?: boolean
  className?: string
  contentClassName?: string
}

export const SkillRibbon = memo(function SkillRibbon({
  skills,
  provider,
  visible,
  onToggle,
  onInsert,
  showToggle = true,
  showContent = true,
  className,
  contentClassName,
}: SkillRibbonProps) {
  const usageCounts = useSkillCompositionStore((state) => state.usageCounts)
  const sorted = useMemo(
    () => sortSkillsByFrequency(skills, usageCounts),
    [skills, usageCounts]
  )

  if (skills.length === 0 || (!showToggle && !showContent)) return null

  return (
    <div className={cn("flex items-center min-h-[32px]", className)} {...getUiIdentityAttributeProps(SKILL_RIBBON_UI_DESCRIPTORS.ribbon)}>
      {showToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
            "hover:bg-muted/60",
            visible
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          )}
          {...getUiIdentityAttributeProps(SKILL_RIBBON_UI_DESCRIPTORS.toggle)}
        >
          <Sparkles className="h-3 w-3" />
          <span>Skills</span>
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform duration-200",
              visible && "rotate-90"
            )}
          />
        </button>
      ) : null}

      {visible && showContent ? (
        <div className={cn(
          "flex-1 flex items-center gap-1 pr-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          contentClassName
        )}>
          {sorted.map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => onInsert(skill)}
              {...getUiIdentityAttributeProps(SKILL_RIBBON_UI_DESCRIPTORS.skillButton)}
              className={cn(
                "shrink-0 px-2 py-0.5 text-xs font-mono rounded-md transition-colors",
                "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground",
                "border border-transparent hover:border-border/50"
              )}
            >
              {formatSkillCommand(skill, provider)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})
