import type { NatsConnection } from "@nats-io/transport-node"
import type { CoordinationStore } from "../shared/coordination-store"
import type { ProjectCoordinationSnapshot, TodoPriority } from "../shared/project-agent-types"
import { commandSubject } from "../shared/nats-subjects"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * NATS-backed coordination store for the runner process.
 * Delegates all mutations to the server via NATS request/reply,
 * using the same command subjects that nats-responders.ts handles.
 *
 * State is a thin cache — the runner process has no in-process EventStore,
 * so coordinationByProject is always empty here. MCP read-backs go through
 * the getSnapshot method which fetches from the server.
 */
export class NatsCoordinationClient implements CoordinationStore {
  private readonly nc: NatsConnection
  private readonly _state: CoordinationStore["state"] = {
    coordinationByProject: new Map(),
  }

  constructor(nc: NatsConnection) {
    this.nc = nc
  }

  get state() {
    return this._state
  }

  private async sendCommand(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const subject = commandSubject(type)
    const reply = await this.nc.request(
      subject,
      encoder.encode(JSON.stringify({ type, ...payload })),
      { timeout: 5_000 },
    )
    const response = JSON.parse(decoder.decode(reply.data)) as { ok: boolean; error?: string; result?: unknown }
    if (!response.ok) {
      throw new Error(response.error ?? `Coordination command ${type} failed`)
    }
    return response.result
  }

  async addTodo(projectId: string, todoId: string, description: string, priority: TodoPriority, createdBy: string): Promise<void> {
    await this.sendCommand("project.todo.add", { projectId, todoId, description, priority, createdBy })
  }

  async claimTodo(projectId: string, todoId: string, sessionId: string): Promise<void> {
    await this.sendCommand("project.todo.claim", { projectId, todoId, sessionId })
  }

  async completeTodo(projectId: string, todoId: string, outputs: string[]): Promise<void> {
    await this.sendCommand("project.todo.complete", { projectId, todoId, outputs })
  }

  async abandonTodo(projectId: string, todoId: string): Promise<void> {
    await this.sendCommand("project.todo.abandon", { projectId, todoId })
  }

  async createClaim(projectId: string, claimId: string, intent: string, files: string[], sessionId: string): Promise<void> {
    await this.sendCommand("project.claim.create", { projectId, claimId, intent, files, sessionId })
  }

  async releaseClaim(projectId: string, claimId: string): Promise<void> {
    await this.sendCommand("project.claim.release", { projectId, claimId })
  }

  async createWorktree(projectId: string, worktreeId: string, branch: string, baseBranch: string, _path: string): Promise<void> {
    await this.sendCommand("project.worktree.create", { projectId, worktreeId, branch, baseBranch })
  }

  async assignWorktree(projectId: string, worktreeId: string, sessionId: string): Promise<void> {
    await this.sendCommand("project.worktree.assign", { projectId, worktreeId, sessionId })
  }

  async removeWorktree(projectId: string, worktreeId: string): Promise<void> {
    await this.sendCommand("project.worktree.remove", { projectId, worktreeId })
  }

  async setRule(projectId: string, ruleId: string, content: string, setBy: string): Promise<void> {
    await this.sendCommand("project.rule.set", { projectId, ruleId, content, setBy })
  }

  async removeRule(projectId: string, ruleId: string): Promise<void> {
    await this.sendCommand("project.rule.remove", { projectId, ruleId })
  }

  async getSnapshot(projectId: string): Promise<ProjectCoordinationSnapshot> {
    return this.sendCommand("project.coordination.snapshot", { projectId }) as Promise<ProjectCoordinationSnapshot>
  }
}
