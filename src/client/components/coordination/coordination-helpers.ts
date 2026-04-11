import type {
  WorkspaceTodo,
  WorkspaceClaim,
  CoordinationTodoStatus,
  TodoPriority,
} from "../../../shared/workspace-types"

export type TodoFilter = "all" | CoordinationTodoStatus

export function filterTodos(todos: WorkspaceTodo[], filter: TodoFilter): WorkspaceTodo[] {
  if (filter === "all") return todos
  return todos.filter((t) => t.status === filter)
}

const PRIORITY_ORDER: Record<TodoPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

export function prioritySortOrder(priority: TodoPriority): number {
  return PRIORITY_ORDER[priority] ?? 1
}

export function sortTodosByPriority(todos: WorkspaceTodo[]): WorkspaceTodo[] {
  return [...todos].sort(
    (a, b) => prioritySortOrder(a.priority) - prioritySortOrder(b.priority)
  )
}

export function formatRelativeTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export function isClaimConflicting(claim: WorkspaceClaim): boolean {
  return claim.conflictsWith !== null
}