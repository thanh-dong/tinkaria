// src/server/task-ledger.ts
import type { TaskEntry } from "../shared/project-agent-types"

interface TaskLedgerOptions {
  abandonTimeoutMs?: number
}

const DEFAULT_ABANDON_TIMEOUT = 10 * 60 * 1000 // 10 minutes

export class TaskLedger {
  private readonly tasks = new Map<string, TaskEntry>()
  private readonly abandonTimeoutMs: number
  private nextId = 1

  constructor(options?: TaskLedgerOptions) {
    this.abandonTimeoutMs = options?.abandonTimeoutMs ?? DEFAULT_ABANDON_TIMEOUT
  }

  claim(description: string, ownedBy: string, branch: string | null): TaskEntry {
    const now = new Date().toISOString()
    const entry: TaskEntry = {
      id: `t-${this.nextId++}`,
      description,
      ownedBy,
      status: "claimed",
      branch,
      outputs: [],
      claimedAt: now,
      updatedAt: now,
    }
    this.tasks.set(entry.id, entry)
    return { ...entry }
  }

  get(id: string): TaskEntry | null {
    const entry = this.tasks.get(id)
    return entry ? { ...entry, outputs: [...entry.outputs] } : null
  }

  list(): TaskEntry[] {
    return [...this.tasks.values()].map((e) => ({ ...e, outputs: [...e.outputs] }))
  }

  complete(id: string, outputs: string[]): TaskEntry | null {
    const entry = this.tasks.get(id)
    if (!entry) return null
    entry.status = "complete"
    entry.outputs = outputs
    entry.updatedAt = new Date().toISOString()
    return { ...entry, outputs: [...entry.outputs] }
  }

  abandon(id: string): TaskEntry | null {
    const entry = this.tasks.get(id)
    if (!entry) return null
    entry.status = "abandoned"
    entry.updatedAt = new Date().toISOString()
    return { ...entry, outputs: [...entry.outputs] }
  }

  updateTimestamp(id: string, timestamp: string): void {
    const entry = this.tasks.get(id)
    if (entry) entry.updatedAt = timestamp
  }

  detectAbandoned(): TaskEntry[] {
    const cutoff = new Date(Date.now() - this.abandonTimeoutMs).toISOString()
    const abandoned: TaskEntry[] = []
    for (const entry of this.tasks.values()) {
      if (entry.status === "claimed" && entry.updatedAt < cutoff) {
        entry.status = "abandoned"
        entry.updatedAt = new Date().toISOString()
        abandoned.push({ ...entry, outputs: [...entry.outputs] })
      }
    }
    return abandoned
  }
}
