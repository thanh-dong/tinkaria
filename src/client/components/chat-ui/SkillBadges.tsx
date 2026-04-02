import { memo } from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

interface SkillBadgesProps {
  skills: string[]
  onRemove: (skill: string) => void
  className?: string
}

export const SkillBadges = memo(function SkillBadges({
  skills,
  onRemove,
  className,
}: SkillBadgesProps) {
  if (skills.length === 0) return null

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {skills.map((skill) => (
        <span
          key={skill}
          className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-mono bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300"
        >
          /{skill}
          <button
            onClick={() => onRemove(skill)}
            className="rounded p-0.5 opacity-40 group-hover:opacity-100 hover:bg-amber-500/20 dark:hover:bg-amber-400/20 transition-opacity"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  )
})

interface SkillBadgesReadonlyProps {
  skills: string[]
  className?: string
}

export const SkillBadgesReadonly = memo(function SkillBadgesReadonly({
  skills,
  className,
}: SkillBadgesReadonlyProps) {
  if (skills.length === 0) return null

  return (
    <div className={cn("flex items-center gap-1 flex-wrap justify-end", className)}>
      {skills.map((skill) => (
        <span
          key={skill}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono text-muted-foreground"
        >
          /{skill}
        </span>
      ))}
    </div>
  )
})
