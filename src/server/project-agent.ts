// src/server/project-agent.ts
import type { SessionRecord, TaskEntry, SearchResult, ResourceState, DelegationResult } from "../shared/project-agent-types"
import type { SessionIndex } from "./session-index"
import type { TaskLedger } from "./task-ledger"
import type { TranscriptSearchIndex } from "./transcript-search"
import type { ResourceRegistry } from "./resource-registry"

interface ProjectAgentArgs {
  sessions: SessionIndex
  tasks: TaskLedger
  search: TranscriptSearchIndex
  resources: ResourceRegistry
}

export class ProjectAgent {
  private readonly sessions: SessionIndex
  private readonly tasks: TaskLedger
  private readonly search: TranscriptSearchIndex
  private readonly resources: ResourceRegistry

  constructor(args: ProjectAgentArgs) {
    this.sessions = args.sessions
    this.tasks = args.tasks
    this.search = args.search
    this.resources = args.resources
  }

  querySessions(projectId: string): SessionRecord[] {
    return this.sessions.getSessionsByProject(projectId)
  }

  getSessionSummary(chatId: string): SessionRecord | null {
    return this.sessions.getSession(chatId)
  }

  searchWork(query: string, limit: number): SearchResult[] {
    return this.search.search(query, limit)
  }

  listTasks(): TaskEntry[] {
    return this.tasks.list()
  }

  getTask(taskId: string): TaskEntry | null {
    return this.tasks.get(taskId)
  }

  claimTask(description: string, ownedBy: string, branch: string | null): TaskEntry {
    return this.tasks.claim(description, ownedBy, branch)
  }

  completeTask(taskId: string, outputs: string[]): TaskEntry | null {
    return this.tasks.complete(taskId, outputs)
  }

  queryResources(): ResourceState[] {
    return this.resources.listResources()
  }

  async delegate(request: string, projectId: string): Promise<DelegationResult> {
    const sessions = this.querySessions(projectId)
    const tasks = this.listTasks()
    const resources = this.queryResources()

    const lower = request.toLowerCase()

    // Resource queries — deterministic, no LLM
    if (lower.includes("resource") || lower.includes("postgres") || lower.includes("redis") || lower.includes("running")) {
      if (resources.length === 0) {
        return { status: "ok", message: "No resources registered." }
      }
      const summary = resources.map((r) => `${r.name} (${r.kind}): ${r.status}, ${r.leases.length} active lease(s)`).join("; ")
      return { status: "ok", message: summary, data: { resources } }
    }

    // Task queries — deterministic, no LLM
    if (lower.includes("task") || lower.includes("working on") || lower.includes("who")) {
      if (tasks.length === 0) {
        return { status: "ok", message: "No tasks claimed." }
      }
      const summary = tasks.map((t) => `[${t.status}] "${t.description}" owned by ${t.ownedBy}`).join("; ")
      return { status: "ok", message: summary, data: { tasks } }
    }

    // Search queries — lexical, no LLM
    if (lower.includes("search") || lower.includes("find") || lower.includes("implemented")) {
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
    if (resources.length > 0) parts.push(`${resources.length} resource(s) registered`)
    return { status: "ok", message: parts.length > 0 ? parts.join(", ") + "." : "No project activity recorded yet." }
  }
}
