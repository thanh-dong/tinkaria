import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod/v4"
import type { AgentProvider, TranscriptEntry } from "../shared/types"
import { LOG_PREFIX } from "../shared/branding"
import { normalizeServerModel } from "./provider-catalog"

interface OriginRecord {
  originChatId: string
  depth: number
}

interface OrchestratorCoordinator {
  activeTurns: Map<string, unknown>
  startTurnForChat(args: {
    chatId: string
    provider: AgentProvider
    content: string
    model: string
    effort?: string
    planMode: boolean
    appendUserPrompt: boolean
  }): Promise<void>
  cancel(chatId: string): Promise<void>
  disposeChat(chatId: string): Promise<void>
}

interface OrchestratorStore {
  createChat(projectId: string): Promise<{ id: string; projectId: string }>
  requireChat(chatId: string): { id: string; projectId: string; provider: AgentProvider | null }
  getProject(projectId: string): { id: string; localPath: string } | null
  listChatsByProject(projectId: string): Array<{ id: string }>
}

export interface SessionOrchestratorArgs {
  store: OrchestratorStore
  coordinator: OrchestratorCoordinator
  onMessageAppended?: (chatId: string, entry: TranscriptEntry) => void
  maxDepth?: number
  maxConcurrency?: number
}

interface PendingWaiter {
  resolve: (value: { result: string; isError: boolean }) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class SessionOrchestrator {
  private readonly store: OrchestratorStore
  private readonly coordinator: OrchestratorCoordinator
  private readonly maxDepth: number
  private readonly maxConcurrency: number
  private readonly origins = new Map<string, OriginRecord>()
  private readonly children = new Map<string, Set<string>>()
  private readonly waiters = new Map<string, PendingWaiter>()

  constructor(args: SessionOrchestratorArgs) {
    this.store = args.store
    this.coordinator = args.coordinator
    this.maxDepth = args.maxDepth ?? 1
    this.maxConcurrency = args.maxConcurrency ?? 3
  }

  async spawnAgent(
    callerChatId: string,
    args: { instruction: string; provider?: AgentProvider; model?: string },
  ): Promise<{ chatId: string }> {
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

    const activeSteered = this.countActiveSteered(callerChat.projectId)
    if (activeSteered >= this.maxConcurrency) {
      throw new Error(
        `Max concurrency (${this.maxConcurrency}) reached for project ${callerChat.projectId}`,
      )
    }

    const newChat = await this.store.createChat(callerChat.projectId)
    this.origins.set(newChat.id, { originChatId: callerChatId, depth: newDepth })

    let siblings = this.children.get(callerChatId)
    if (!siblings) {
      siblings = new Set()
      this.children.set(callerChatId, siblings)
    }
    siblings.add(newChat.id)

    const model = args.model ?? normalizeServerModel(provider)
    console.warn(`${LOG_PREFIX} spawnAgent: ${callerChatId} -> ${newChat.id} (depth=${newDepth}, provider=${provider})`)

    await this.coordinator.startTurnForChat({
      chatId: newChat.id,
      provider,
      content: args.instruction,
      model,
      planMode: false,
      appendUserPrompt: true,
    })

    return { chatId: newChat.id }
  }

  async sendInput(
    _callerChatId: string,
    args: { targetChatId: string; content: string; model?: string },
  ): Promise<void> {
    const targetChat = this.store.requireChat(args.targetChatId)
    if (this.coordinator.activeTurns.has(args.targetChatId)) {
      throw new Error(`Target chat ${args.targetChatId} is already running (busy)`)
    }

    const provider = targetChat.provider ?? "claude"
    await this.coordinator.startTurnForChat({
      chatId: args.targetChatId,
      provider,
      content: args.content,
      model: args.model ?? normalizeServerModel(provider),
      planMode: false,
      appendUserPrompt: true,
    })
  }

  async waitForResult(
    _callerChatId: string,
    args: { targetChatId: string; timeoutMs?: number },
  ): Promise<{ result: string; isError: boolean }> {
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
    if (!waiter || entry.kind !== "result") return
    this.waiters.delete(chatId)
    clearTimeout(waiter.timer)
    waiter.resolve({ result: entry.result, isError: entry.isError })
  }

  async closeAgent(
    _callerChatId: string,
    args: { targetChatId: string },
  ): Promise<void> {
    await this.coordinator.disposeChat(args.targetChatId)
    this.cleanup(args.targetChatId)
  }

  destroy(): void {
    for (const [, waiter] of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error("Orchestrator disposed"))
    }
    this.waiters.clear()
    this.origins.clear()
    this.children.clear()
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

  private countActiveSteered(projectId: string): number {
    let count = 0
    for (const [chatId] of this.origins) {
      try {
        const chat = this.store.requireChat(chatId)
        if (chat.projectId === projectId) count++
      } catch {
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
        "Spawn a new agent session in the same project. Returns the new session's chatId. Use wait_agent to get the result.",
        {
          instruction: z.string().describe("Task instruction for the new agent"),
          provider: z.enum(["claude", "codex"]).optional().describe("AI provider — defaults to caller's provider"),
        },
        async (args) => {
          const result = await orchestrator.spawnAgent(callerChatId, {
            instruction: args.instruction,
            provider: args.provider as AgentProvider | undefined,
          })
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
        },
      ),
      tool(
        "send_input",
        "Send a follow-up message to an existing steered session.",
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
