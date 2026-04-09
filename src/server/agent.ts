import type {
  AgentProvider,
  NormalizedToolCall,
  PendingToolSnapshot,
  SessionStatus,
  TranscriptEntry,
} from "../shared/types"
import type { ClientCommand } from "../shared/protocol"
import { EventStore } from "./event-store"
import { CodexAppServerManager } from "./codex-app-server"
import type { CodexRuntime } from "./codex-runtime"
import { createDefaultCodexHarnessBinding, startCodexTurn } from "./codex-harness"
import { generateTitleForChat } from "./generate-title"
import type { SkillCache } from "./skill-discovery"
import type { HarnessToolRequest, HarnessTurn } from "./harness-types"
import {
  codexServiceTierFromModelOptions,
  getServerProviderCatalog,
  normalizeClaudeModelOptions,
  normalizeCodexModelOptions,
  normalizeServerModel,
} from "./provider-catalog"
import { resolveClaudeApiModelId } from "../shared/types"
import { getWebContextPrompt } from "../shared/web-context"
import type { SessionOrchestrator } from "./orchestration"
import { startClaudeTurn } from "./claude-harness"

export { getWebContextPrompt }

interface PendingToolRequest {
  toolUseId: string
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
  resolve: (result: unknown) => void
}

interface ActiveTurn {
  chatId: string
  provider: AgentProvider
  turn: HarnessTurn
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  status: SessionStatus
  pendingTool: PendingToolRequest | null
  postToolFollowUp: { content: string; planMode: boolean } | null
  hasFinalResult: boolean
  cancelRequested: boolean
  cancelRecorded: boolean
}

interface AgentCoordinatorArgs {
  store: EventStore
  onStateChange: () => void
  onMessageAppended?: (chatId: string, entry: TranscriptEntry) => void
  codexManager?: CodexAppServerManager
  codexRuntime?: CodexRuntime
  generateTitle?: (messageContent: string, cwd: string) => Promise<string | null>
  orchestrator?: SessionOrchestrator
  skillCache?: SkillCache
}

export function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
  createdAt = Date.now()
): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt,
    ...entry,
  } as TranscriptEntry
}

const DELEGATION_PREAMBLE = [
  "You were spawned by a parent session to handle a delegated task.",
  "Your final output will be read by the parent via wait_agent — end with a clear, structured report.",
  "The parent does not see your intermediate tool calls or reasoning.",
  "If the parent sends follow-up instructions via send_input, respond to each and report again.",
].join("\n")

function buildTurnPrompt(content: string, opts?: { delegatedContext?: string; isSpawned?: boolean; chatId?: string }): string {
  if (!opts?.isSpawned && !opts?.delegatedContext) return content
  const parts: string[] = []
  if (opts.isSpawned) {
    const idLine = opts.chatId ? `\nYour session ID is ${opts.chatId}.` : ""
    parts.push(DELEGATION_PREAMBLE + idLine)
  }
  if (opts.delegatedContext) parts.push(opts.delegatedContext)
  parts.push(`Delegated task:\n${content}`)
  return parts.join("\n\n")
}

export function discardedToolResult(
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
) {
  if (tool.toolKind === "ask_user_question") {
    return {
      discarded: true,
      answers: {},
    }
  }

  return {
    discarded: true,
  }
}


export class AgentCoordinator {
  private readonly store: EventStore
  private readonly onStateChange: () => void
  private readonly onMessageAppended: ((chatId: string, entry: TranscriptEntry) => void) | undefined
  private readonly codexRuntime: CodexRuntime
  private readonly generateTitle: (messageContent: string, cwd: string) => Promise<string | null>
  private readonly skillCache: SkillCache | undefined
  orchestrator: SessionOrchestrator | undefined
  readonly activeTurns = new Map<string, ActiveTurn>()

  constructor(args: AgentCoordinatorArgs) {
    this.store = args.store
    this.onStateChange = args.onStateChange
    this.onMessageAppended = args.onMessageAppended
    this.codexRuntime = args.codexRuntime ?? createDefaultCodexHarnessBinding(args.codexManager ?? new CodexAppServerManager())
    this.generateTitle = args.generateTitle ?? generateTitleForChat
    this.orchestrator = args.orchestrator
    this.skillCache = args.skillCache
  }

  private async appendAndPublish(chatId: string, entry: TranscriptEntry): Promise<void> {
    await this.store.appendMessage(chatId, entry)
    this.onMessageAppended?.(chatId, entry)
  }

  getActiveStatuses() {
    const statuses = new Map<string, SessionStatus>()
    for (const [chatId, turn] of this.activeTurns.entries()) {
      statuses.set(chatId, turn.status)
    }
    return statuses
  }

  getPendingTool(chatId: string): PendingToolSnapshot | null {
    const pending = this.activeTurns.get(chatId)?.pendingTool
    if (!pending) return null
    return { toolUseId: pending.toolUseId, toolKind: pending.tool.toolKind }
  }

  private resolveProvider(command: Extract<ClientCommand, { type: "chat.send" }>, currentProvider: AgentProvider | null) {
    if (currentProvider) return currentProvider
    return command.provider ?? "claude"
  }

  private getProviderSettings(provider: AgentProvider, command: Extract<ClientCommand, { type: "chat.send" }>) {
    const catalog = getServerProviderCatalog(provider)
    if (provider === "claude") {
      const model = normalizeServerModel(provider, command.model)
      const modelOptions = normalizeClaudeModelOptions(model, command.modelOptions, command.effort)
      return {
        model: resolveClaudeApiModelId(model, modelOptions.contextWindow),
        effort: modelOptions.reasoningEffort,
        serviceTier: undefined,
        planMode: catalog.supportsPlanMode ? Boolean(command.planMode) : false,
      }
    }

    const modelOptions = normalizeCodexModelOptions(command.modelOptions, command.effort)
    return {
      model: normalizeServerModel(provider, command.model),
      effort: modelOptions.reasoningEffort,
      serviceTier: codexServiceTierFromModelOptions(modelOptions),
      planMode: catalog.supportsPlanMode ? Boolean(command.planMode) : false,
    }
  }

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
  }) {
    const chat = this.store.requireChat(args.chatId)
    if (this.activeTurns.has(args.chatId)) {
      throw new Error("Chat is already running")
    }

    if (chat.provider !== args.provider) {
      if (chat.sessionToken) {
        await this.store.setSessionToken(args.chatId, null)
      }
      await this.store.setChatProvider(args.chatId, args.provider)
    }
    await this.store.setChatModel(args.chatId, args.model)
    await this.store.setPlanMode(args.chatId, args.planMode)

    const existingMessages = this.store.getMessages(args.chatId)
    const shouldGenerateTitle = args.appendUserPrompt && chat.title === "New Chat" && existingMessages.length === 0

    if (args.appendUserPrompt) {
      await this.appendAndPublish(args.chatId, timestamped({ kind: "user_prompt", content: args.content }, Date.now()))
    }
    await this.store.recordTurnStarted(args.chatId)

    const project = this.store.getProject(chat.projectId)
    if (!project) {
      throw new Error("Project not found")
    }

    if (shouldGenerateTitle) {
      void this.generateTitleInBackground(args.chatId, args.content, project.localPath)
    }

    const onToolRequest = async (request: HarnessToolRequest): Promise<unknown> => {
      const active = this.activeTurns.get(args.chatId)
      if (!active) {
        throw new Error("Chat turn ended unexpectedly")
      }

      active.status = "waiting_for_user"
      this.onStateChange()

      return await new Promise<unknown>((resolve) => {
        active.pendingTool = {
          toolUseId: request.tool.toolId,
          tool: request.tool,
          resolve,
        }
      })
    }

    let turn: HarnessTurn
    try {
      if (args.provider === "claude") {
        turn = await startClaudeTurn({
          content: buildTurnPrompt(args.content, { delegatedContext: args.delegatedContext, isSpawned: args.isSpawned, chatId: args.chatId }),
          localPath: project.localPath,
          model: args.model,
          effort: args.effort,
          planMode: args.planMode,
          sessionToken: chat.sessionToken,
          onToolRequest,
          orchestrator: this.orchestrator,
          chatId: args.chatId,
        })
      } else {
        const skills = await this.skillCache?.get(project.localPath)
        turn = await startCodexTurn({
          binding: this.codexRuntime,
          chatId: args.chatId,
          projectId: project.id,
          localPath: project.localPath,
          content: buildTurnPrompt(args.content, { delegatedContext: args.delegatedContext, isSpawned: args.isSpawned, chatId: args.chatId }),
          model: args.model,
          effort: args.effort as any,
          serviceTier: args.serviceTier,
          planMode: args.planMode,
          skills,
          orchestrator: this.orchestrator,
          orchestrationChatId: args.chatId,
          sessionToken: chat.sessionToken,
          onToolRequest,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.appendAndPublish(
        args.chatId,
        timestamped({ kind: "result", subtype: "error", isError: true, durationMs: 0, result: message })
      )
      await this.store.recordTurnFailed(args.chatId, message)
      this.onStateChange()
      return
    }

    const active: ActiveTurn = {
      chatId: args.chatId,
      provider: args.provider,
      turn,
      model: args.model,
      effort: args.effort,
      serviceTier: args.serviceTier,
      planMode: args.planMode,
      status: "starting",
      pendingTool: null,
      postToolFollowUp: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
    }
    this.activeTurns.set(args.chatId, active)
    this.onStateChange()

    if (turn.getAccountInfo) {
      void turn.getAccountInfo()
        .then(async (accountInfo) => {
          if (!accountInfo) return
          await this.appendAndPublish(args.chatId, timestamped({ kind: "account_info", accountInfo }))
          this.onStateChange()
        })
        .catch(() => undefined)
    }

    if (turn.getContextUsage) {
      void turn.getContextUsage()
        .then(async (usage) => {
          if (!usage) return
          await this.appendAndPublish(args.chatId, timestamped({
            kind: "context_usage",
            contextUsage: {
              percentage: usage.percentage,
              totalTokens: usage.totalTokens,
              maxTokens: usage.maxTokens,
            },
          }))
          this.onStateChange()
        })
        .catch(() => undefined)
    }

    void this.runTurn(active)
  }

  async send(command: Extract<ClientCommand, { type: "chat.send" }>) {
    let chatId = command.chatId

    if (!chatId) {
      if (!command.projectId) {
        throw new Error("Missing projectId for new chat")
      }
      const created = await this.store.createChat(command.projectId)
      chatId = created.id
    }

    const chat = this.store.requireChat(chatId)
    const provider = this.resolveProvider(command, chat.provider)
    const settings = this.getProviderSettings(provider, command)
    await this.startTurnForChat({
      chatId,
      provider,
      content: command.content,
      model: settings.model,
      effort: settings.effort,
      serviceTier: settings.serviceTier,
      planMode: settings.planMode,
      appendUserPrompt: true,
    })

    return { chatId }
  }

  private async generateTitleInBackground(chatId: string, messageContent: string, cwd: string) {
    try {
      const title = await this.generateTitle(messageContent, cwd)
      if (!title) return

      const chat = this.store.requireChat(chatId)
      if (chat.title !== "New Chat") return

      await this.store.renameChat(chatId, title)
      this.onStateChange()
    } catch {
      // Ignore background title generation failures.
    }
  }

  private async runTurn(active: ActiveTurn) {
    try {
      for await (const event of active.turn.stream) {
        if (event.type === "session_token" && event.sessionToken) {
          await this.store.setSessionToken(active.chatId, event.sessionToken)
          this.onStateChange()
          continue
        }

        if (!event.entry) continue

        // After cancel, suppress final-state entries — cancel() already emitted "interrupted"
        if (active.cancelRequested && (event.entry.kind === "result" || event.entry.kind === "interrupted")) {
          continue
        }

        await this.appendAndPublish(active.chatId, event.entry)

        if (event.entry.kind === "system_init") {
          active.status = "running"
        }

        if (event.entry.kind === "result") {
          active.hasFinalResult = true
          if (event.entry.isError) {
            await this.store.recordTurnFailed(active.chatId, event.entry.result || "Turn failed")
          } else if (!active.cancelRequested) {
            await this.store.recordTurnFinished(active.chatId)
          }
        }

        this.onStateChange()
      }
    } catch (error) {
      if (!active.cancelRequested) {
        const message = error instanceof Error ? error.message : String(error)
        await this.appendAndPublish(
          active.chatId,
          timestamped({
            kind: "result",
            subtype: "error",
            isError: true,
            durationMs: 0,
            result: message,
          })
        )
        await this.store.recordTurnFailed(active.chatId, message)
      }
    } finally {
      if (active.cancelRequested && !active.cancelRecorded) {
        await this.store.recordTurnCancelled(active.chatId)
      }
      active.turn.close()
      this.activeTurns.delete(active.chatId)
      this.onStateChange()

      if (active.postToolFollowUp && !active.cancelRequested) {
        try {
          await this.startTurnForChat({
            chatId: active.chatId,
            provider: active.provider,
            content: active.postToolFollowUp.content,
            model: active.model,
            effort: active.effort,
            serviceTier: active.serviceTier,
            planMode: active.postToolFollowUp.planMode,
            appendUserPrompt: false,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await this.appendAndPublish(
            active.chatId,
            timestamped({
              kind: "result",
              subtype: "error",
              isError: true,
              durationMs: 0,
              result: message,
            })
          )
          await this.store.recordTurnFailed(active.chatId, message)
          this.onStateChange()
        }
      }
    }
  }

  async cancel(chatId: string) {
    const active = this.activeTurns.get(chatId)
    if (!active) return

    active.cancelRequested = true

    const pendingTool = active.pendingTool
    active.pendingTool = null

    if (pendingTool) {
      const result = discardedToolResult(pendingTool.tool)
      await this.appendAndPublish(
        chatId,
        timestamped({
          kind: "tool_result",
          toolId: pendingTool.toolUseId,
          content: result,
        })
      )
      if (active.provider === "codex" && pendingTool.tool.toolKind === "exit_plan_mode") {
        pendingTool.resolve(result)
      }
    }

    await this.appendAndPublish(chatId, timestamped({ kind: "interrupted" }))
    await this.store.recordTurnCancelled(chatId)
    active.cancelRecorded = true
    active.hasFinalResult = true

    try {
      await active.turn.interrupt()
    } catch {
      active.turn.close()
    }

    this.activeTurns.delete(chatId)
    this.onStateChange()
  }

  async disposeChat(chatId: string) {
    await this.cancel(chatId)
    this.codexRuntime.stopSession(chatId)
  }

  async respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>) {
    const active = this.activeTurns.get(command.chatId)
    if (!active || !active.pendingTool) {
      throw new Error("No pending tool request")
    }

    const pending = active.pendingTool
    if (pending.toolUseId !== command.toolUseId) {
      throw new Error("Tool response does not match active request")
    }

    await this.appendAndPublish(
      command.chatId,
      timestamped({
        kind: "tool_result",
        toolId: command.toolUseId,
        content: command.result,
      })
    )

    active.pendingTool = null
    active.status = "running"

    if (pending.tool.toolKind === "exit_plan_mode") {
      const result = (command.result ?? {}) as {
        confirmed?: boolean
        clearContext?: boolean
        message?: string
      }
      if (result.confirmed && result.clearContext) {
        await this.store.setSessionToken(command.chatId, null)
        await this.appendAndPublish(command.chatId, timestamped({ kind: "context_cleared" }))
      }

      if (active.provider === "codex") {
        active.postToolFollowUp = result.confirmed
          ? {
              content: result.message
                ? `Proceed with the approved plan. Additional guidance: ${result.message}`
                : "Proceed with the approved plan.",
              planMode: false,
            }
          : {
              content: result.message
                ? `Revise the plan using this feedback: ${result.message}`
                : "Revise the plan using this feedback.",
              planMode: true,
            }
      }
    }

    pending.resolve(command.result)

    this.onStateChange()
  }
}
