import { memo } from "react"
import { cn } from "../../lib/utils"
import type { TocHeading } from "./ContentViewerContext"

interface TocPanelProps {
  headings: TocHeading[]
  onSelect: (id: string) => void
}

const levelIndent: Record<number, string> = {
  1: "",
  2: "pl-3",
  3: "pl-6",
}

export const TocPanel = memo(function TocPanel({ headings, onSelect }: TocPanelProps) {
  if (headings.length === 0) return null

  return (
    <nav aria-label="Table of contents" className="border-b border-border bg-muted/20 px-3 py-2">
      <ul className="flex flex-col gap-0.5">
        {headings.map((heading) => (
          <li key={heading.id}>
            <button
              type="button"
              onClick={() => onSelect(heading.id)}
              className={cn(
                "w-full truncate rounded px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                levelIndent[heading.level] ?? "pl-6",
              )}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
})
