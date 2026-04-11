import { useMemo, useState } from "react"
import {
  CheckCircle2,
  Circle,
  CircleDot,
  ArrowUpCircle,
  ArrowRightCircle,
  ArrowDownCircle,
  X,
} from "lucide-react"
import type { WorkspaceTodo, TodoPriority, CoordinationTodoStatus } from "../../../shared/workspace-types"
import { filterTodos, sortTodosByPriority, formatRelativeTimestamp, type TodoFilter } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "../ui/alert-dialog"
import { PanelHeader, PanelAddForm, PanelBody, PanelEmptyState, PanelListItem } from "./CoordinationPanel"

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

  const filtered = useMemo(() => sortTodosByPriority(filterTodos(todos, filter)), [todos, filter])

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
      <PanelHeader title="Shared Todos" count={todos.length} onAdd={() => setShowAddForm(!showAddForm)} addLabel="Add todo">
        <div className="flex gap-1 px-3 py-1.5 border-b border-border">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={filter === opt.value}
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
      </PanelHeader>

      <PanelAddForm show={showAddForm}>
        <Input
          size="sm"
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
            aria-label="Priority"
          >
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <Button variant="default" size="sm" onClick={handleAdd}>
            Add
          </Button>
        </div>
      </PanelAddForm>

      <PanelBody>
        {filtered.length === 0 && (
          <PanelEmptyState message="No todos yet" description="Add a shared task for the team" actionLabel="Add todo" onAction={() => setShowAddForm(true)} />
        )}
        {filtered.map((todo) => {
          const StatusIcon = STATUS_ICON[todo.status]
          const PriorityIcon = PRIORITY_ICON[todo.priority]
          return (
            <PanelListItem key={todo.id}>
              <div className="flex items-start gap-2">
                <StatusIcon className={cn("h-4 w-4 mt-0.5 shrink-0", todo.status === "complete" ? "text-green-500" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", todo.status === "complete" && "line-through text-muted-foreground")}>
                    {todo.description}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PriorityIcon className={cn("h-3 w-3", PRIORITY_COLOR[todo.priority])} aria-label={`${todo.priority} priority`} />
                    {todo.claimedBy && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {todo.claimedBy}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTimestamp(todo.updatedAt)}
                    </span>
                  </div>
                  {(todo.status === "open" || todo.status === "claimed") && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {todo.status === "open" && (
                        <Button variant="outline" size="sm" onClick={() => onClaimTodo(todo.id, "ui")}>Claim</Button>
                      )}
                      {todo.status === "claimed" && (
                        <>
                          <Button variant="outline" size="sm" className="text-green-500 border-green-500/30" onClick={() => onCompleteTodo(todo.id, [])}>Done</Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">Abandon</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Abandon todo?</AlertDialogTitle>
                                <AlertDialogDescription>This will mark the todo as abandoned and release the claim.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onAbandonTodo(todo.id)}>Abandon</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </PanelListItem>
          )
        })}
      </PanelBody>
    </div>
  )
}
