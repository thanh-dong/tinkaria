import tinkariaMarkUrl from "../../../../assets/tinkaria-mark-fine.svg"
import { cn } from "../../lib/utils"

interface TinkariaSidebarMarkProps {
  className?: string
  imageClassName?: string
}

export function TinkariaSidebarMark({ className, imageClassName }: TinkariaSidebarMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] border border-slate-300/70 bg-white/70 p-0.5 shadow-[0_0_0_0.5px_rgba(255,255,255,0.35)] dark:border-white/12 dark:bg-white/[0.03] dark:shadow-none",
        className,
      )}
    >
      <img src={tinkariaMarkUrl} alt="" aria-hidden="true" className={cn("size-5", imageClassName)} />
    </span>
  )
}
