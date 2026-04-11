import type { NatsConnection } from "@nats-io/transport-node"
import type { CoordinationStore } from "../shared/coordination-store"
import type { WorkspaceCoordinationSnapshot, TodoPriority } from "../shared/workspace-types"
import { commandSubject } from "../shared/nats-subjects"
import { decompressPayload } from "../shared/compression"

const encoder = new TextEncoder()

/**
 * NATS-backed coordination store for the runner process.
 * Delegates all mutations to the server via NATS request/reply,
 * using the same command subjects that nats-responders.ts handles.
 *
 * State is a thin cache — the runner process has no in-process EventStore,
 * so coordinationByWorkspace is always empty here. MCP read-backs go through
 * the getSnapshot method which fetches from the server.
 */
export class NatsCoordinationClient implements CoordinationStore {
  private readonly nc: NatsConnection
  private readonly _state: CoordinationStore["state"] = {
    coordinationByWorkspace: new Map(),
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
    const decompressed = await decompressPayload(reply.data)
    const response = JSON.parse(new TextDecoder().decode(decompressed)) as { ok: boolean; error?: string; result?: unknown }
    if (!response.ok) {
      throw new Error(response.error ?? `Coordination command ${type} failed`)
    }
    return response.result
  }

  async addTodo(workspaceId: string, todoId: string, description: string, priority: TodoPriority, createdBy: string): Promise<void> {
    await this.sendCommand("workspace.todo.add", { workspaceId, todoId, description, priority, createdBy })
  }

  async claimTodo(workspaceId: string, todoId: string, sessionId: string): Promise<void> {
    await this.sendCommand("workspace.todo.claim", { workspaceId, todoId, sessionId })
  }

  async completeTodo(workspaceId: string, todoId: string, outputs: string[]): Promise<void> {
    await this.sendCommand("workspace.todo.complete", { workspaceId, todoId, outputs })
  }

  async abandonTodo(workspaceId: string, todoId: string): Promise<void> {
    await this.sendCommand("workspace.todo.abandon", { workspaceId, todoId })
  }

  async createClaim(workspaceId: string, claimId: string, intent: string, files: string[], sessionId: string): Promise<void> {
    await this.sendCommand("workspace.claim.create", { workspaceId, claimId, intent, files, sessionId })
  }

  async releaseClaim(workspaceId: string, claimId: string): Promise<void> {
    await this.sendCommand("workspace.claim.release", { workspaceId, claimId })
  }

  async createWorktree(workspaceId: string, worktreeId: string, branch: string, baseBranch: string, _path: string): Promise<void> {
    await this.sendCommand("workspace.worktree.create", { workspaceId, worktreeId, branch, baseBranch })
  }

  async assignWorktree(workspaceId: string, worktreeId: string, sessionId: string): Promise<void> {
    await this.sendCommand("workspace.worktree.assign", { workspaceId, worktreeId, sessionId })
  }

  async removeWorktree(workspaceId: string, worktreeId: string): Promise<void> {
    await this.sendCommand("workspace.worktree.remove", { workspaceId, worktreeId })
  }

  async setRule(workspaceId: string, ruleId: string, content: string, setBy: string): Promise<void> {
    await this.sendCommand("workspace.rule.set", { workspaceId, ruleId, content, setBy })
  }

  async removeRule(workspaceId: string, ruleId: string): Promise<void> {
    await this.sendCommand("workspace.rule.remove", { workspaceId, ruleId })
  }

  async getSnapshot(workspaceId: string): Promise<WorkspaceCoordinationSnapshot> {
    return this.sendCommand("workspace.coordination.snapshot", { workspaceId }) as Promise<WorkspaceCoordinationSnapshot>
  }
}
