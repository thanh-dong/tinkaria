import { memo, useMemo, useState } from "react"
import { Check, Sparkles } from "lucide-react"
import { cn } from "../../lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { useSkillCompositionStore, sortSkillsByFrequency } from "../../stores/skillCompositionStore"

interface SkillPickerProps {
  availableSkills: string[]
  selectedSkills: string[]
  onToggleSkill: (skill: string) => void
  disabled?: boolean
}

export const SkillPicker = memo(function SkillPicker({
  availableSkills,
  selectedSkills,
  onToggleSkill,
  disabled = false,
}: SkillPickerProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const selectedSet = useMemo(() => new Set(selectedSkills), [selectedSkills])
  const selectionCount = selectedSkills.length
  const usageCounts = useSkillCompositionStore((state) => state.usageCounts)

  const sortedSkills = useMemo(
    () => sortSkillsByFrequency(availableSkills, usageCounts),
    [availableSkills, usageCounts]
  )

  const filteredSkills = useMemo(() => {
    if (!filter) return sortedSkills
    const lower = filter.toLowerCase()
    return sortedSkills.filter((skill) => skill.toLowerCase().includes(lower))
  }, [sortedSkills, filter])

  const showFilter = availableSkills.length > 6

  if (availableSkills.length === 0) return null

  const triggerContent = (
    <>
      <Sparkles className="h-3.5 w-3.5" />
      <span>{selectionCount > 0 ? `${selectionCount} Skill${selectionCount > 1 ? "s" : ""}` : "Skills"}</span>
    </>
  )

  if (disabled) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-2 py-1 text-sm rounded-md text-muted-foreground [&>svg]:shrink-0 opacity-70 cursor-default [&>span]:whitespace-nowrap"
      >
        {triggerContent}
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setFilter("") }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors [&>svg]:shrink-0 [&>span]:whitespace-nowrap",
            "hover:bg-muted/50",
            selectionCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          )}
        >
          {triggerContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-64 md:w-[min(540px,calc(100vw-2rem))] p-1"
      >
        {showFilter ? (
          <div className="px-1 pt-1 pb-0.5">
            <input
              type="text"
              placeholder="Filter skills..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-full text-sm px-2.5 py-1.5 rounded-md border border-border bg-transparent outline-none placeholder:text-muted-foreground/50 focus:border-muted-foreground/30 transition-colors"
              autoFocus
            />
          </div>
        ) : null}

        <div className="max-h-[280px] overflow-y-auto [scrollbar-width:thin] grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
          {filteredSkills.map((skill) => {
            const isSelected = selectedSet.has(skill)
            return (
              <button
                key={skill}
                onClick={() => onToggleSkill(skill)}
                className={cn(
                  "w-full flex items-center gap-2 p-2 border border-border/0 rounded-lg text-left transition-opacity",
                  isSelected ? "bg-muted border-border" : "hover:opacity-60"
                )}
                title={`/${skill}`}
              >
                {isSelected
                  ? <Check className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  : <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="text-sm font-medium truncate">/{skill}</span>
              </button>
            )
          })}
        </div>

        {filteredSkills.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">
            No match
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
})
