import type { NatsConnection } from "@nats-io/transport-node"
import type { ClientCommand } from "../shared/protocol"
import type { AgentProvider, SessionStatus, PendingToolSnapshot } from "../shared/types"
import { resolveClaudeApiModelId } from "../shared/types"
import { runnerCmdSubject, type StartTurnCommand } from "../shared/runner-protocol"
import type { EventStore } from "./event-store"
import {
  getServerProviderCatalog,
  normalizeClaudeModelOptions,
  normalizeServerModel,
} from "./provider-catalog"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface RunnerProxyOptions {
  nc: NatsConnection
  store: EventStore
  runnerId: string
  getActiveStatuses: () => Map<string, SessionStatus>
  getPendingTool?: (chatId: string) => PendingToolSnapshot | null
}

export class RunnerProxy {
  private readonly nc: NatsConnection
  private readonly store: EventStore
  private readonly runnerId: string
  private readonly _getActiveStatuses: () => Map<string, SessionStatus>

  /** Orchestration compatibility: check if a chat has an active turn */
  readonly activeTurns: { has(chatId: string): boolean }

  constructor(options: RunnerProxyOptions) {
    this.nc = options.nc
    this.store = options.store
    this.runnerId = options.runnerId
    this._getActiveStatuses = options.getActiveStatuses
    this.activeTurns = {
      has: (chatId: string) => this._getActiveStatuses().has(chatId),
    }
  }

  getActiveStatuses(): Map<string, SessionStatus> {
    return this._getActiveStatuses()
  }

  private async sendCommand(cmd: string, payload: unknown): Promise<unknown> {
    const reply = await this.nc.request(
      runnerCmdSubject(this.runnerId, cmd),
      encoder.encode(JSON.stringify(payload)),
      { timeout: 10_000 },
    )
    const response = JSON.parse(decoder.decode(reply.data))
    if (!response.ok) throw new Error(response.error ?? "Runner command failed")
    return response.result
  }

  /** Send a chat message — creates chat if needed, delegates turn to runner */
  async send(command: Extract<ClientCommand, { type: "chat.send" }>): Promise<{ chatId: string }> {
    let chatId = command.chatId
    if (!chatId) {
      if (!command.projectId) throw new Error("Missing projectId for new chat")
      const created = await this.store.createChat(command.projectId)
      chatId = created.id
    }

    const chat = this.store.requireChat(chatId)
    const provider = chat.provider ?? command.provider ?? "claude"

    const catalog = getServerProviderCatalog(provider)
    let model: string
    let planMode: boolean

    if (provider === "claude") {
      model = normalizeServerModel(provider, command.model)
      const modelOptions = normalizeClaudeModelOptions(model, command.modelOptions, command.effort)
      model = resolveClaudeApiModelId(model, modelOptions.contextWindow)
      planMode = catalog.supportsPlanMode ? Boolean(command.planMode) : false
    } else {
      model = normalizeServerModel(provider, command.model)
      planMode = catalog.supportsPlanMode ? Boolean(command.planMode) : false
    }

    const project = this.store.getProject(chat.projectId)
    if (!project) throw new Error("Project not found")

    const existingMessages = await this.store.getMessages(chatId)

    const startCmd: StartTurnCommand = {
      chatId,
      provider,
      content: command.content,
      model,
      planMode,
      appendUserPrompt: true,
      projectLocalPath: project.localPath,
      sessionToken: chat.sessionToken,
      chatTitle: chat.title,
      existingMessageCount: existingMessages.length,
      projectId: chat.projectId,
    }

    if (chat.provider !== provider) {
      if (chat.sessionToken) {
        await this.store.setSessionToken(chatId, null)
      }
      await this.store.setChatProvider(chatId, provider)
    }
    await this.store.setChatModel(chatId, model)
    await this.store.setPlanMode(chatId, planMode)

    await this.sendCommand("start_turn", startCmd)
    return { chatId }
  }

  /** Start a turn for a specific chat — used by orchestration */
  async startTurnForChat(args: {
    chatId: string
    provider: AgentProvider
    content: string
    delegatedContext?: string
    isSpawned?: boolean
    model: string
    effort?: string
    serviceTier?: "fast"
    planMode: boolean
    appendUserPrompt: boolean
  }): Promise<void> {
    const chat = this.store.requireChat(args.chatId)
    const project = this.store.getProject(chat.projectId)
    if (!project) throw new Error("Project not found")

    if (chat.provider !== args.provider) {
      if (chat.sessionToken) {
        await this.store.setSessionToken(args.chatId, null)
      }
      await this.store.setChatProvider(args.chatId, args.provider)
    }
    await this.store.setChatModel(args.chatId, args.model)
    await this.store.setPlanMode(args.chatId, args.planMode)

    const startCmd: StartTurnCommand = {
      chatId: args.chatId,
      provider: args.provider,
      content: args.content,
      model: args.model,
      planMode: args.planMode,
      appendUserPrompt: args.appendUserPrompt,
      projectLocalPath: project.localPath,
      sessionToken: chat.sessionToken,
      chatTitle: chat.title,
      existingMessageCount: (await this.store.getMessages(args.chatId)).length,
      projectId: chat.projectId,
    }
    await this.sendCommand("start_turn", startCmd)
  }

  async cancel(chatId: string): Promise<void> {
    await this.sendCommand("cancel_turn", { chatId })
  }

  async respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>): Promise<void> {
    await this.sendCommand("respond_tool", {
      chatId: command.chatId,
      toolUseId: command.toolUseId,
      result: command.result,
    })
  }

  async disposeChat(chatId: string): Promise<void> {
    try {
      await this.cancel(chatId)
    } catch {
      // Chat might not be running — swallow
    }
  }
}
