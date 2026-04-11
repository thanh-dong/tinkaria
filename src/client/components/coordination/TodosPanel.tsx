import { useState } from "react"
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Plus,
  ArrowUpCircle,
  ArrowRightCircle,
  ArrowDownCircle,
  X,
} from "lucide-react"
import type { WorkspaceTodo, TodoPriority, CoordinationTodoStatus } from "../../../shared/workspace-types"
import { filterTodos, sortTodosByPriority, formatRelativeTimestamp, type TodoFilter } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface TodosPanelProps {
  todos: WorkspaceTodo[]
  onAddTodo: (description: string, priority: TodoPriority) => void
  onClaimTodo: (todoId: string, sessionId: string) => void
  onCompleteTodo: (todoId: string, outputs: string[]) => void
  onAbandonTodo: (todoId: string) => void
}

const STATUS_ICON: Record<CoordinationTodoStatus, typeof Circle> = {
  open: Circle,
  claimed: CircleDot,
  complete: CheckCircle2,
  abandoned: X,
}

const PRIORITY_ICON: Record<TodoPriority, typeof ArrowUpCircle> = {
  high: ArrowUpCircle,
  normal: ArrowRightCircle,
  low: ArrowDownCircle,
}

const PRIORITY_COLOR: Record<TodoPriority, string> = {
  high: "text-red-500",
  normal: "text-muted-foreground",
  low: "text-blue-400",
}

const FILTER_OPTIONS: { value: TodoFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "claimed", label: "Claimed" },
  { value: "complete", label: "Done" },
]

export function TodosPanel({
  todos,
  onAddTodo,
  onClaimTodo,
  onCompleteTodo,
  onAbandonTodo,
}: TodosPanelProps) {
  const [filter, setFilter] = useState<TodoFilter>("all")
  const [newDescription, setNewDescription] = useState("")
  const [newPriority, setNewPriority] = useState<TodoPriority>("normal")
  const [showAddForm, setShowAddForm] = useState(false)

  const filtered = sortTodosByPriority(filterTodos(todos, filter))

  function handleAdd() {
    const trimmed = newDescription.trim()
    if (!trimmed) return
    onAddTodo(trimmed, newPriority)
    setNewDescription("")
    setNewPriority("normal")
    setShowAddForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Shared Todos</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Add todo"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Task description..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              className="bg-transparent border border-border rounded-md px-2 py-1 text-xs text-foreground"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <Button variant="default" size="sm" onClick={handleAdd}>
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 px-3 py-1.5 border-b border-border">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={cn(
              "px-2 py-0.5 rounded-full text-xs transition-colors",
              filter === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No todos</p>
        )}
        {filtered.map((todo) => {
          const StatusIcon = STATUS_ICON[todo.status]
          const PriorityIcon = PRIORITY_ICON[todo.priority]
          return (
            <div
              key={todo.id}
              className="flex items-start gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors"
            >
              <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", todo.status === "complete" ? "text-green-500" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm", todo.status === "complete" && "line-through text-muted-foreground")}>
                  {todo.description}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <PriorityIcon className={cn("h-3 w-3", PRIORITY_COLOR[todo.priority])} />
                  {todo.claimedBy && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {todo.claimedBy}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTimestamp(todo.updatedAt)}
                  </span>
                  {todo.status === "open" && (
                    <button className="text-xs text-primary hover:underline" onClick={() => onClaimTodo(todo.id, "ui")}>claim</button>
                  )}
                  {todo.status === "claimed" && (
                    <>
                      <button className="text-xs text-green-500 hover:underline" onClick={() => onCompleteTodo(todo.id, [])}>done</button>
                      <button className="text-xs text-muted-foreground hover:underline" onClick={() => onAbandonTodo(todo.id)}>abandon</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
