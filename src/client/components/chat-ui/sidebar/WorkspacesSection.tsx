import { Plus, Boxes } from "lucide-react"
import type { IndependentWorkspace } from "../../../../shared/types"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import { cn } from "../../../lib/utils"

interface Props {
  workspaces: IndependentWorkspace[]
  onSelect: (workspaceId: string) => void
  onCreate: () => void
  activeWorkspaceId?: string | null
}

export function WorkspacesSection({ workspaces, onSelect, onCreate, activeWorkspaceId }: Props) {
  if (workspaces.length === 0) {
    return (
      <div className="p-[10px]">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Workspaces</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5.5 w-5.5 !rounded"
                onClick={onCreate}
              >
                <Plus className="size-3.5 text-slate-500 dark:text-slate-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              New workspace
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-1">
      <div className="sticky top-0 bg-background dark:bg-card z-10 p-[10px] flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">Workspaces</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5.5 w-5.5 !rounded"
              onClick={onCreate}
            >
              <Plus className="size-3.5 text-slate-500 dark:text-slate-400" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={4}>
            New workspace
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-[2px]">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors",
              "hover:bg-muted/50",
              activeWorkspaceId === ws.id && "bg-muted"
            )}
            onClick={() => onSelect(ws.id)}
          >
            <Boxes className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="truncate text-foreground">{ws.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
