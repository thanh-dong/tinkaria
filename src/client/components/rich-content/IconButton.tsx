import type { ReactNode } from "react"
import { cn } from "../../lib/utils"

interface IconButtonProps {
  ariaLabel: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}

export function IconButton({ ariaLabel, onClick, active, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground"
      )}
    >
      {children}
    </button>
  )
}
