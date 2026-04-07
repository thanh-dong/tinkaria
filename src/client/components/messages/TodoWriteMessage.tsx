import { memo } from "react"
import { Check, Circle, ListChecks, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"
import type { ProcessedToolCall } from "./types"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"

const TODO_AREA_DESCRIPTOR = createUiIdentityDescriptor({
  id: "message.todo.area",
  c3ComponentId: "c3-111",
  c3ComponentLabel: "messages",
})

const STATUS_CONFIG = {
  completed:   { Icon: Check,   iconClass: "text-emerald-500",             textClass: "text-muted-foreground" },
  in_progress: { Icon: Loader2, iconClass: "text-foreground animate-spin", textClass: "text-foreground font-medium" },
  pending:     { Icon: Circle,  iconClass: "text-muted-foreground",        textClass: "text-muted-foreground" },
} as const

interface Props {
  message: Extract<ProcessedToolCall, { toolKind: "todo_write" }>
}

export const TodoWriteMessage = memo(function TodoWriteMessage({ message }: Props) {
  const todos = message.input.todos

  if (!todos.length) return null

  return (
    <div className="w-full" {...getUiIdentityAttributeProps(TODO_AREA_DESCRIPTOR)}>
      <div className="rounded-2xl border border-border overflow-hidden">
        <h3 className="font-medium text-foreground text-sm p-3 px-4 bg-card border-b border-border flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Progress
        </h3>
        <div>
          {todos.map((todo, index) => {
            const isLast = index === todos.length - 1
            const { Icon, iconClass, textClass } = STATUS_CONFIG[todo.status]
            return (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 bg-background",
                  !isLast && "border-b border-border"
                )}
              >
                <Icon className={cn("h-4 w-4 flex-shrink-0", iconClass)} />
                <span className={cn("text-sm", textClass)}>
                  {todo.status === "in_progress" ? todo.activeForm : todo.content}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
