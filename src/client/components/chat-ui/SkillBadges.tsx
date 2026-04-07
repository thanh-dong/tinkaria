import { memo } from "react"
import { cn } from "../../lib/utils"

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
