import { ArrowDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../components/ui/button"
import type { ChatNavigatorState } from "./useChatNavigator"

interface ChatNavigatorProps {
  nav: ChatNavigatorState
  onScrollToBottom?: () => void
}

export function ChatNavigator({ nav, onScrollToBottom }: ChatNavigatorProps) {
  const { currentIndex, totalCount, currentLabel, goNext, goPrev } = nav

  if (totalCount === 0) {
    if (!onScrollToBottom) return null
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={onScrollToBottom}
        className="rounded-full border border-border bg-white dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-600"
      >
        <ArrowDown className="h-5 w-5" />
      </Button>
    )
  }

  const displayIndex = Math.max(0, currentIndex) + 1

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-white dark:bg-slate-700 dark:border-slate-600 shadow-sm px-1 py-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={goPrev}
        className="h-7 w-7 rounded-full dark:text-slate-100 dark:hover:bg-slate-600"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-muted-foreground min-w-0">
        <span className="font-medium shrink-0 tabular-nums">{displayIndex}/{totalCount}</span>
        <span className="truncate max-w-[180px]">{currentLabel}</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={goNext}
        className="h-7 w-7 rounded-full dark:text-slate-100 dark:hover:bg-slate-600"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
