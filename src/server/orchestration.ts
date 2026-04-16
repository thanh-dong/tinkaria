import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod/v4"
import type { AgentProvider, DelegationMode, DelegationResumeMode, OrchestrationChildNode, OrchestrationChildStatus, OrchestrationHierarchySnapshot, TranscriptEntry, SessionStatus } from "../shared/types"
import type { DelegationCoordinator } from "./delegation-coordinator"
import { LOG_PREFIX } from "../shared/branding"
import { normalizeServerModel } from "./provider-catalog"
import { toTranscriptLine } from "./transcript-utils"

interface OriginRecord {
  originChatId: string
  depth: number
  instruction: string
  spawnedAt: number
  lastStatus: OrchestrationChildStatus
  lastStatusAt: number
}

interface OrchestratorCoordinator {
  activeTurns: { has(key: string): boolean }
  getActiveStatuses(): Map<string, SessionStatus>
  startTurnForChat(args: {
    chatId: string
    provider: AgentProvider
    content: string
    delegatedContext?: string
    isSpawned?: boolean
    model: string
    effort?: string
    planMode: boolean
    appendUserPrompt: boolean
  }): Promise<void>
  queue(args: {
    type: "chat.queue"
    chatId: string
    provider?: AgentProvider
    content: string
    model?: string
    effort?: string
    planMode?: boolean
  }): Promise<{ chatId: string; queued: boolean }>
  cancel(chatId: string): Promise<void>
  disposeChat(chatId: string): Promise<void>
}

interface OrchestratorStore {
  createChat(workspaceId: string): Promise<{ id: string; workspaceId: string }>
  requireChat(chatId: string): { id: string; workspaceId: string; provider: AgentProvider | null }
  getProject(workspaceId: string): { id: string; localPath: string } | null
  listChatsByProject(workspaceId: string): Array<{ id: string }>
  getMessages(chatId: string): Promise<TranscriptEntry[]>
}

export interface SessionOrchestratorArgs {
  store: OrchestratorStore
  coordinator: OrchestratorCoordinator
  delegationCoordinator?: DelegationCoordinator
  onMessageAppended?: (chatId: string, entry: TranscriptEntry) => void
  maxDepth?: number
  maxConcurrency?: number
}

interface PendingWaiter {
  resolve: (value: { result: string; isError: boolean }) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface ExternalAgentStateRecord {
  chatId: string
  status: OrchestrationChildStatus
  spawnedAt: number
  lastStatusAt: number
  instruction: string
}

const MAX_DELEGATED_CONTEXT_ENTRIES = 24
const MAX_DELEGATED_CONTEXT_CHARS = 12_000
const MAX_DELEGATED_CONTEXT_LINE_CHARS = 600

function entryToDelegatedContextLine(entry: TranscriptEntry): string | null {
  return toTranscriptLine(entry, MAX_DELEGATED_CONTEXT_LINE_CHARS)
}

function buildDelegatedContext(entries: TranscriptEntry[]): string | undefined {
  const relevantEntries = entries
    .map(entryToDelegatedContextLine)
    .filter((line): line is string => Boolean(line))

  if (relevantEntries.length === 0) return undefined

  const selected = relevantEntries.slice(-MAX_DELEGATED_CONTEXT_ENTRIES)
  const omittedCount = relevantEntries.length - selected.length
  const headerLines = [
    "Forked parent chat context:",
    "Treat this as background context copied from the spawning chat before your task starts.",
    "Do not re-answer it directly unless the new task asks you to.",
  ]
  if (omittedCount > 0) {
    headerLines.push(`Older transcript lines omitted: ${omittedCount}.`)
  }

  const lines = [...headerLines, ...selected]
  let serialized = lines.join("\n")

  if (serialized.length <= MAX_DELEGATED_CONTEXT_CHARS) {
    return serialized
  }

  const trimmedSelected: string[] = []
  let remaining = MAX_DELEGATED_CONTEXT_CHARS - headerLines.join("\n").length - 1
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const line = selected[index]!
    const cost = line.length + 1
    if (remaining - cost < 0) break
    trimmedSelected.unshift(line)
    remaining -= cost
  }

  if (trimmedSelected.length === 0) {
    return headerLines.join("\n")
  }

  return [...headerLines, ...trimmedSelected].join("\n")
}

export class SessionOrchestrator {
  private readonly store: OrchestratorStore
  private readonly coordinator: OrchestratorCoordinator
  private readonly delegationCoordinator?: DelegationCoordinator
  private readonly maxDepth: number
  private readonly maxConcurrency: number
  private readonly origins = new Map<string, OriginRecord>()
  private readonly children = new Map<string, Set<string>>()
  private readonly waiters = new Map<string, PendingWaiter>()
  private readonly externalChildren = new Map<string, Map<string, ExternalAgentStateRecord>>()

  constructor(args: SessionOrchestratorArgs) {
    this.store = args.store
    this.coordinator = args.coordinator
    this.delegationCoordinator = args.delegationCoordinator
    this.maxDepth = args.maxDepth ?? 3
    this.maxConcurrency = args.maxConcurrency ?? 10
  }

  async spawnAgent(
    callerChatId: string,
    args: {
      instruction: string
      provider?: AgentProvider
      model?: string
      forkContext?: boolean
      mode?: DelegationMode
      resume?: DelegationResumeMode
      resumeHint?: string
    },
  ): Promise<{ chatId: string; delegationId?: string }> {
    const callerChat = this.store.requireChat(callerChatId)
    const provider = args.provider ?? callerChat.provider ?? "claude"
    const callerDepth = this.origins.get(callerChatId)?.depth ?? 0

    const newDepth = callerDepth + 1
    if (newDepth > this.maxDepth) {
      if (callerDepth > 0) {
        throw new Error(
          `Circular orchestration detected: spawned session at depth ${callerDepth} cannot spawn (max depth ${this.maxDepth})`,
        )
      }
      throw new Error(
        `Max orchestration depth (${this.maxDepth}) exceeded — cannot spawn at depth ${newDepth}`,
      )
    }

    const activeSteered = this.countActiveSteered(callerChat.workspaceId)
    if (activeSteered >= this.maxConcurrency) {
      throw new Error(
        `Max concurrency (${this.maxConcurrency}) reached for project ${callerChat.workspaceId}`,
      )
    }

    const newChat = await this.store.createChat(callerChat.workspaceId)
    const now = Date.now()
    this.origins.set(newChat.id, {
      originChatId: callerChatId,
      depth: newDepth,
      instruction: args.instruction.slice(0, 120),
      spawnedAt: now,
      lastStatus: "spawning",
      lastStatusAt: now,
    })

    let siblings = this.children.get(callerChatId)
    if (!siblings) {
      siblings = new Set()
      this.children.set(callerChatId, siblings)
    }
    siblings.add(newChat.id)

    const model = args.model ?? normalizeServerModel(provider)
    const delegatedContext = args.forkContext
      ? buildDelegatedContext(await this.store.getMessages(callerChatId))
      : undefined

    // Create durable delegation record if coordinator is present
    let delegationId: string | undefined
    if (this.delegationCoordinator) {
      const mode = args.mode ?? "blocking"
      const resume = args.resume ?? "gate"
      const parentMessages = await this.store.getMessages(callerChatId)
      const resumeHint = args.resumeHint ?? this.delegationCoordinator.generateResumeHint(parentMessages)

      const result = await this.delegationCoordinator.createDelegation({
        workspaceId: callerChat.workspaceId,
        parentChatId: callerChatId,
        childChatId: newChat.id,
        childProvider: provider,
        instructionPreview: args.instruction,
        mode,
        resume,
        depth: newDepth,
        resumeHint,
      })
      delegationId = result.delegationId
    }

    console.warn(`${LOG_PREFIX} spawnAgent: ${callerChatId} -> ${newChat.id} (depth=${newDepth}, provider=${provider})`)

    await this.coordinator.startTurnForChat({
      chatId: newChat.id,
      provider,
      content: args.instruction,
      delegatedContext,
      isSpawned: true,
      model,
      planMode: false,
      appendUserPrompt: true,
    })

    const result: { chatId: string; delegationId?: string } = { chatId: newChat.id }
    if (delegationId) result.delegationId = delegationId
    return result
  }

  async sendInput(
    callerChatId: string,
    args: { targetChatId: string; content: string; model?: string },
  ): Promise<void> {
    this.requireOwnedTarget(callerChatId, args.targetChatId)
    const targetChat = this.store.requireChat(args.targetChatId)
    const provider = targetChat.provider ?? "claude"
    const model = args.model ?? normalizeServerModel(provider)

    if (this.coordinator.activeTurns.has(args.targetChatId)) {
      await this.coordinator.queue({
        type: "chat.queue",
        chatId: args.targetChatId,
        provider,
        content: args.content,
        model,
        planMode: false,
      })
      return
    }

    await this.coordinator.startTurnForChat({
      chatId: args.targetChatId,
      provider,
      content: args.content,
      model,
      planMode: false,
      appendUserPrompt: true,
    })
  }

  async waitForResult(
    callerChatId: string,
    args: { targetChatId: string; timeoutMs?: number },
  ): Promise<{ result: string; isError: boolean }> {
    this.requireOwnedTarget(callerChatId, args.targetChatId)
    const timeoutMs = args.timeoutMs ?? 120_000

    return new Promise<{ result: string; isError: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(args.targetChatId)
        void this.coordinator.cancel(args.targetChatId).catch(() => undefined)
        reject(new Error(`Timed out waiting for result from ${args.targetChatId} after ${timeoutMs}ms`))
      }, timeoutMs)

      this.waiters.set(args.targetChatId, { resolve, reject, timer })
    })
  }

  onMessageAppended(chatId: string, entry: TranscriptEntry): void {
    const waiter = this.waiters.get(chatId)
    if (waiter && entry.kind === "result") {
      this.waiters.delete(chatId)
      clearTimeout(waiter.timer)
      waiter.resolve({ result: entry.result, isError: entry.isError })
    }

    this.updateExternalHierarchy(chatId, entry)
  }

  async closeAgent(
    callerChatId: string,
    args: { targetChatId: string },
  ): Promise<void> {
    this.requireOwnedTarget(callerChatId, args.targetChatId)
    // Mark as closed tombstone first (visible in hierarchy)
    const origin = this.origins.get(args.targetChatId)
    if (origin) {
      origin.lastStatus = "closed"
      origin.lastStatusAt = Date.now()
    }

    // Clear any pending waiter
    const waiter = this.waiters.get(args.targetChatId)
    if (waiter) {
      clearTimeout(waiter.timer)
      this.waiters.delete(args.targetChatId)
    }

    // Dispose the underlying chat (async)
    await this.coordinator.disposeChat(args.targetChatId)
  }

  pruneTombstones(): void {
    const toRemove: string[] = []
    for (const [chatId, origin] of this.origins) {
      if (origin.lastStatus === "closed") {
        toRemove.push(chatId)
      }
    }
    for (const chatId of toRemove) {
      this.cleanup(chatId)
    }
  }

  destroy(): void {
    for (const [, waiter] of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error("Orchestrator disposed"))
    }
    this.waiters.clear()
    this.origins.clear()
    this.children.clear()
    this.externalChildren.clear()
  }

  getHierarchy(chatId: string): OrchestrationHierarchySnapshot {
    const childSet = this.children.get(chatId)
    const externalChildren = this.externalChildren.get(chatId)
    if ((!childSet || childSet.size === 0) && (!externalChildren || externalChildren.size === 0)) {
      return { children: [] }
    }

    const statuses = this.coordinator.getActiveStatuses()
    const internalChildren = childSet
      ? [...childSet].map((childId) => this.buildChildNode(childId, statuses))
      : []
    const seenIds = new Set(internalChildren.map((child) => child.chatId))
    const externalNodes = externalChildren
      ? [...externalChildren.values()]
          .filter((child) => !seenIds.has(child.chatId))
          .map((child) => ({
            chatId: child.chatId,
            externalSessionId: child.chatId,
            status: child.status,
            spawnedAt: child.spawnedAt,
            lastStatusAt: child.lastStatusAt,
            instruction: child.instruction,
            children: [],
          }))
      : []

    return {
      children: [...internalChildren, ...externalNodes],
    }
  }

  listAgents(chatId: string): OrchestrationHierarchySnapshot {
    return this.getHierarchy(chatId)
  }

  private buildChildNode(
    childId: string,
    statuses: Map<string, SessionStatus>,
  ): OrchestrationChildNode {
    const origin = this.origins.get(childId)
    const now = Date.now()

    if (!origin) {
      return {
        chatId: childId,
        status: "closed",
        spawnedAt: now,
        lastStatusAt: now,
        instruction: "",
        children: [],
      }
    }

    const resolvedStatus = this.resolveChildStatus(childId, origin, statuses)
    if (resolvedStatus !== origin.lastStatus) {
      origin.lastStatus = resolvedStatus
      origin.lastStatusAt = now
    }

    const nestedChildren = this.children.get(childId)
    return {
      chatId: childId,
      status: origin.lastStatus,
      spawnedAt: origin.spawnedAt,
      lastStatusAt: origin.lastStatusAt,
      instruction: origin.instruction,
      children: nestedChildren
        ? [...nestedChildren].map((id) => this.buildChildNode(id, statuses))
        : [],
    }
  }

  private resolveChildStatus(
    _childId: string,
    origin: OriginRecord,
    statuses: Map<string, SessionStatus>,
  ): OrchestrationChildStatus {
    if (origin.lastStatus === "closed") return "closed"

    const tinkariaStatus = statuses.get(_childId)
    if (!tinkariaStatus) {
      return "completed"
    }

    switch (tinkariaStatus) {
      case "starting":
      case "running":
        return "running"
      case "waiting_for_user":
        return "waiting"
      case "failed":
        return "failed"
      default:
        return "running"
    }
  }

  async cancelWithCascade(chatId: string): Promise<void> {
    const childSet = this.children.get(chatId)
    if (childSet) {
      for (const childId of childSet) {
        await this.cancelWithCascade(childId)
      }
    }
    await this.coordinator.cancel(chatId)
    this.cleanup(chatId)
  }

  private countActiveSteered(workspaceId: string): number {
    const statuses = this.coordinator.getActiveStatuses()
    let count = 0
    for (const [chatId, origin] of this.origins) {
      try {
        const chat = this.store.requireChat(chatId)
        if (chat.workspaceId !== workspaceId) continue
        const status = this.resolveChildStatus(chatId, origin, statuses)
        if (status === "spawning" || status === "running" || status === "waiting") {
          count += 1
        }
      } catch (error) {
        void (error instanceof Error ? error.message : String(error))
        // Chat may have been disposed — skip
      }
    }
    return count
  }

  private cleanup(chatId: string): void {
    const origin = this.origins.get(chatId)
    if (origin) {
      this.children.get(origin.originChatId)?.delete(chatId)
    }
    this.origins.delete(chatId)
    this.children.delete(chatId)

    const waiter = this.waiters.get(chatId)
    if (waiter) {
      clearTimeout(waiter.timer)
      this.waiters.delete(chatId)
    }
  }

  private updateExternalHierarchy(chatId: string, entry: TranscriptEntry): void {
    const payload = this.extractCollabPayload(entry)
    if (!payload) return

    const receiverIds = this.extractReceiverThreadIds(payload)
    if (receiverIds.length === 0) return

    let children = this.externalChildren.get(chatId)
    if (!children) {
      children = new Map()
      this.externalChildren.set(chatId, children)
    }

    const now = Date.now()
    const instruction = this.extractExternalInstruction(payload)
    const entryIsError = entry.kind === "tool_result" ? Boolean(entry.isError) : false
    for (const receiverId of receiverIds) {
      const existing = children.get(receiverId)
      children.set(receiverId, {
        chatId: receiverId,
        status: this.resolveExternalStatus(payload, receiverId, entryIsError, existing?.status),
        spawnedAt: existing?.spawnedAt ?? entry.createdAt ?? now,
        lastStatusAt: now,
        instruction: instruction ?? existing?.instruction ?? "Delegated task",
      })
    }
  }

  private extractCollabPayload(entry: TranscriptEntry): Record<string, unknown> | null {
    if (entry.kind === "tool_call" && entry.tool.toolKind === "subagent_task") {
      return entry.tool.rawInput ?? null
    }
    if (entry.kind === "tool_result" && entry.content && typeof entry.content === "object" && !Array.isArray(entry.content)) {
      const record = entry.content as Record<string, unknown>
      if (Array.isArray(record.receiverThreadIds)) {
        return record
      }
    }
    return null
  }

  private extractReceiverThreadIds(payload: Record<string, unknown>): string[] {
    const rawReceiverIds = payload.receiverThreadIds
    if (!Array.isArray(rawReceiverIds)) return []
    return rawReceiverIds.filter((value): value is string => typeof value === "string")
  }

  private extractExternalInstruction(payload: Record<string, unknown>): string | null {
    const prompt = payload.prompt
    if (typeof prompt !== "string" || prompt.length === 0) return null
    return prompt.slice(0, 120)
  }

  private resolveExternalStatus(
    payload: Record<string, unknown>,
    receiverId: string,
    isError: boolean,
    previousStatus?: OrchestrationChildStatus,
  ): OrchestrationChildStatus {
    if (isError) return "failed"

    const toolName = typeof payload.tool === "string" ? payload.tool : null
    const agentStates = payload.agentsStates
    const stateRecord = agentStates && typeof agentStates === "object" && !Array.isArray(agentStates)
      ? (agentStates as Record<string, unknown>)[receiverId]
      : null
    const stateStatus = stateRecord && typeof stateRecord === "object" && !Array.isArray(stateRecord)
      ? (stateRecord as Record<string, unknown>).status
      : null
    const normalizedState = this.normalizeExternalStatus(typeof stateStatus === "string" ? stateStatus : null)
    if (normalizedState) return normalizedState

    if (toolName === "closeAgent") return "closed"
    if (toolName === "wait") return previousStatus === "failed" ? "failed" : "completed"
    if (toolName === "spawnAgent") {
      return this.normalizeExternalStatus(typeof payload.status === "string" ? payload.status : null) ?? "spawning"
    }
    if (toolName === "sendInput" || toolName === "resumeAgent") return "running"

    return this.normalizeExternalStatus(typeof payload.status === "string" ? payload.status : null) ?? previousStatus ?? "running"
  }

  private normalizeExternalStatus(status: string | null): OrchestrationChildStatus | null {
    if (!status) return null
    switch (status.toLowerCase()) {
      case "pending":
      case "queued":
      case "created":
      case "starting":
      case "spawning":
        return "spawning"
      case "running":
      case "inprogress":
      case "in_progress":
      case "working":
        return "running"
      case "waiting":
      case "waiting_for_user":
      case "paused":
        return "waiting"
      case "completed":
      case "done":
      case "success":
        return "completed"
      case "failed":
      case "error":
        return "failed"
      case "closed":
      case "cancelled":
      case "interrupted":
        return "closed"
      default:
        return null
    }
  }

  private requireOwnedTarget(callerChatId: string, targetChatId: string): OriginRecord {
    const origin = this.origins.get(targetChatId)
    if (!origin) {
      throw new Error(`Target chat ${targetChatId} is not a spawned agent`)
    }
    if (origin.originChatId !== callerChatId) {
      throw new Error(`Caller ${callerChatId} does not own spawned agent ${targetChatId}`)
    }
    return origin
  }
}

/**
 * Creates an in-process MCP server with orchestration tools for a specific session.
 * Each Claude turn gets its own server instance scoped to the caller's chatId.
 */
export function createOrchestrationMcpServer(
  orchestrator: SessionOrchestrator,
  callerChatId: string,
) {
  return createSdkMcpServer({
    name: "session-orchestration",
    tools: [
      tool(
        "spawn_agent",
        "Spawn a new agent session in the same project. Returns the new session's chatId and delegationId. " +
          "Delegation persists across session boundaries: blocking children auto-resume the parent when done; " +
          "background children inject results passively. Use wait_agent for synchronous result, or rely on auto-resume for durable async workflows.",
        {
          instruction: z.string().describe("Task instruction for the new agent"),
          provider: z.enum(["claude", "codex"]).optional().describe("AI provider — defaults to caller's provider"),
          fork_context: z.boolean().optional().describe(
            "When true, seed the new agent with a bounded snapshot of the current chat transcript before its first task message.",
          ),
          mode: z
            .enum(["blocking", "background"])
            .optional()
            .describe(
              "Delegation mode. 'blocking' (default): parent auto-resumes when child completes. " +
                "'background': fire-and-forget — result injected into parent transcript but no auto-resume.",
            ),
          resume: z
            .enum(["immediate", "gate"])
            .optional()
            .describe(
              "Multi-child resume strategy. 'gate' (default): parent resumes only after ALL blocking children complete. " +
                "'immediate': parent resumes after EACH child completes.",
            ),
        },
        async (args) => {
          const result = await orchestrator.spawnAgent(callerChatId, {
            instruction: args.instruction,
            provider: args.provider as AgentProvider | undefined,
            forkContext: args.fork_context,
            mode: args.mode,
            resume: args.resume,
          })
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
        },
      ),
      tool(
        "list_agents",
        "List the current caller's spawned agent tree and statuses.",
        {},
        async () => {
          const result = orchestrator.listAgents(callerChatId)
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
        },
      ),
      tool(
        "send_input",
        "Send a follow-up message to an existing steered session. Use this to steer a child after its first turn, request additional work, or accumulate incremental results across multiple exchanges. The child resumes with its full conversation context preserved.",
        {
          targetChatId: z.string().describe("The chatId of the target session"),
          content: z.string().describe("Message content to send"),
        },
        async (args) => {
          await orchestrator.sendInput(callerChatId, args)
          return { content: [{ type: "text" as const, text: "Input sent" }] }
        },
      ),
      tool(
        "wait_agent",
        "Block until a steered session completes its current turn. Returns the result text.",
        {
          targetChatId: z.string().describe("The chatId of the session to wait for"),
          timeoutMs: z.number().optional().describe("Max wait time in milliseconds (default: 120000)"),
        },
        async (args) => {
          const result = await orchestrator.waitForResult(callerChatId, args)
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            isError: result.isError,
          }
        },
      ),
      tool(
        "close_agent",
        "Dispose a steered session and free resources.",
        {
          targetChatId: z.string().describe("The chatId of the session to close"),
        },
        async (args) => {
          await orchestrator.closeAgent(callerChatId, args)
          return { content: [{ type: "text" as const, text: "Agent closed" }] }
        },
      ),
    ],
  })
}
