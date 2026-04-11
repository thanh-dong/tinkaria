// src/server/project-agent.ts
import { randomUUID } from "node:crypto"
import type { WorkspaceTodo, SessionRecord, SearchResult, DelegationResult } from "../shared/workspace-types"
import type { SessionIndex } from "./session-index"
import type { EventStore } from "./event-store"
import type { TranscriptSearchIndex } from "./transcript-search"

const TASK_KEYWORDS = ["task", "working on", "who", "claimed"]
const SEARCH_KEYWORDS = ["search", "find", "implemented", "where"]

interface WorkspaceAgentArgs {
  sessions: SessionIndex
  store: EventStore
  search: TranscriptSearchIndex
  workspaceId: string
}

export class WorkspaceAgent {
  private readonly sessions: SessionIndex
  private readonly store: EventStore
  private readonly search: TranscriptSearchIndex
  private readonly workspaceId: string

  constructor(args: WorkspaceAgentArgs) {
    this.sessions = args.sessions
    this.store = args.store
    this.search = args.search
    this.workspaceId = args.workspaceId
  }

  querySessions(workspaceId: string): SessionRecord[] {
    return this.sessions.getSessionsByProject(workspaceId)
  }

  getSessionSummary(chatId: string): SessionRecord | null {
    return this.sessions.getSession(chatId)
  }

  searchWork(query: string, limit: number): SearchResult[] {
    return this.search.search(query, limit)
  }

  listTasks(): WorkspaceTodo[] {
    const coord = this.store.state.coordinationByWorkspace.get(this.workspaceId)
    if (!coord) return []
    return Array.from(coord.todos.values())
  }

  getTask(taskId: string): WorkspaceTodo | null {
    const coord = this.store.state.coordinationByWorkspace.get(this.workspaceId)
    if (!coord) return null
    return coord.todos.get(taskId) ?? null
  }

  async claimTask(description: string, claimedBy: string, _branch: string | null): Promise<WorkspaceTodo> {
    const todoId = randomUUID()
    await this.store.addTodo(this.workspaceId, todoId, description, "normal", claimedBy)
    await this.store.claimTodo(this.workspaceId, todoId, claimedBy)
    const todo = this.getTask(todoId)
    if (!todo) throw new Error(`Todo ${todoId} not found after creation`)
    return todo
  }

  async completeTask(taskId: string, outputs: string[]): Promise<WorkspaceTodo | null> {
    await this.store.completeTodo(this.workspaceId, taskId, outputs)
    return this.getTask(taskId)
  }

  async abandonTask(taskId: string): Promise<WorkspaceTodo | null> {
    await this.store.abandonTodo(this.workspaceId, taskId)
    return this.getTask(taskId)
  }

  async delegate(request: string): Promise<DelegationResult> {
    const sessions = this.querySessions(this.workspaceId)
    const tasks = this.listTasks()
    const lower = request.toLowerCase()

    if (TASK_KEYWORDS.some((kw) => lower.includes(kw))) {
      if (tasks.length === 0) {
        return { status: "ok", message: "No tasks claimed." }
      }
      const summary = tasks.map((t) => `[${t.status}] "${t.description}" owned by ${t.claimedBy ?? t.createdBy}`).join("; ")
      return { status: "ok", message: summary, data: { tasks } }
    }

    if (SEARCH_KEYWORDS.some((kw) => lower.includes(kw))) {
      const searchResults = this.search.search(request, 5)
      if (searchResults.length === 0) {
        return { status: "ok", message: "No matching transcript entries found." }
      }
      const summary = searchResults.map((r) => `[${r.chatId}] ${r.fragment.slice(0, 100)}`).join("\n")
      return { status: "ok", message: summary, data: { searchResults } }
    }

    // General — summarize known state
    const parts: string[] = []
    if (sessions.length > 0) parts.push(`${sessions.length} session(s) active`)
    if (tasks.length > 0) parts.push(`${tasks.length} task(s) tracked`)
    return { status: "ok", message: parts.length > 0 ? parts.join(", ") + "." : "No project activity recorded yet." }
  }
}
