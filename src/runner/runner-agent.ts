import { jetstream, type JetStream } from "@nats-io/jetstream"
import type { NatsConnection } from "@nats-io/transport-node"
import { LOG_PREFIX } from "../shared/branding"
import type { HarnessToolRequest, HarnessTurn } from "../shared/harness-types"
import {
  runnerEventsSubject,
  type RunnerTurnEvent,
  type StartTurnCommand,
} from "../shared/runner-protocol"
import type {
  AgentProvider,
  NormalizedToolCall,
  PendingToolSnapshot,
  SessionStatus,
  TranscriptEntry,
} from "../shared/types"
import { timestamped, discardedToolResult } from "../shared/transcript-entries"

const encoder = new TextEncoder()

// ── Types ───────────────────────────────────────────────────────────

export type TurnFactory = (args: {
  provider: AgentProvider
  content: string
  localPath: string
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  chatId: string
}) => Promise<HarnessTurn>

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
  /** Preserved from the original StartTurnCommand for follow-up turns */
  originalCmd: StartTurnCommand
}

export interface RunnerAgentOptions {
  nc: NatsConnection
  createTurn: TurnFactory
  generateTitle?: (content: string, cwd: string) => Promise<string | null>
}

// ── RunnerAgent ─────────────────────────────────────────────────────

export class RunnerAgent {
  private readonly js: JetStream
  private readonly nc: NatsConnection
  private readonly createTurn: TurnFactory
  private readonly generateTitle: ((content: string, cwd: string) => Promise<string | null>) | undefined
  readonly activeTurns = new Map<string, ActiveTurn>()

  constructor(options: RunnerAgentOptions) {
    this.nc = options.nc
    this.js = jetstream(options.nc)
    this.createTurn = options.createTurn
    this.generateTitle = options.generateTitle
  }

  // ── Publishing ──────────────────────────────────────────────────

  private publishEvent(chatId: string, event: RunnerTurnEvent): void {
    const subject = runnerEventsSubject(chatId)
    void this.js.publish(subject, encoder.encode(JSON.stringify(event))).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, `JetStream publish failed on ${subject}: ${message}`)
    })
  }

  private publishTranscript(chatId: string, entry: TranscriptEntry): void {
    this.publishEvent(chatId, { type: "transcript", chatId, entry })
  }

  // ── Public API ────────────────────────────────────────────────────

  getActiveStatuses(): Map<string, SessionStatus> {
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

  async startTurn(cmd: StartTurnCommand): Promise<void> {
    if (this.activeTurns.has(cmd.chatId)) {
      throw new Error("Chat is already running")
    }

    const shouldGenerateTitle =
      cmd.appendUserPrompt &&
      cmd.chatTitle === "New Chat" &&
      cmd.existingMessageCount === 0

    // Publish user prompt
    if (cmd.appendUserPrompt) {
      this.publishTranscript(
        cmd.chatId,
        timestamped({ kind: "user_prompt", content: cmd.content })
      )
    }

    // Create tool request handler
    const onToolRequest = async (request: HarnessToolRequest): Promise<unknown> => {
      const active = this.activeTurns.get(cmd.chatId)
      if (!active) throw new Error("Chat turn ended unexpectedly")

      active.status = "waiting_for_user"
      this.publishEvent(cmd.chatId, {
        type: "status_change",
        chatId: cmd.chatId,
        status: "waiting_for_user",
      })
      this.publishEvent(cmd.chatId, {
        type: "pending_tool",
        chatId: cmd.chatId,
        tool: { toolUseId: request.tool.toolId, toolKind: request.tool.toolKind },
      })

      return new Promise<unknown>((resolve) => {
        active.pendingTool = {
          toolUseId: request.tool.toolId,
          tool: request.tool,
          resolve,
        }
      })
    }

    // Start the harness turn
    const turn = await this.createTurn({
      provider: cmd.provider,
      content: cmd.content,
      localPath: cmd.projectLocalPath,
      model: cmd.model,
      planMode: cmd.planMode,
      sessionToken: cmd.sessionToken,
      onToolRequest,
      chatId: cmd.chatId,
    })

    const active: ActiveTurn = {
      chatId: cmd.chatId,
      provider: cmd.provider,
      turn,
      model: cmd.model,
      planMode: cmd.planMode,
      status: "starting",
      pendingTool: null,
      postToolFollowUp: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
      originalCmd: cmd,
    }
    this.activeTurns.set(cmd.chatId, active)

    this.publishEvent(cmd.chatId, {
      type: "status_change",
      chatId: cmd.chatId,
      status: "starting",
    })

    // Background: title generation
    if (shouldGenerateTitle) {
      void this.generateTitleInBackground(cmd.chatId, cmd.content, cmd.projectLocalPath)
    }

    // Run the turn asynchronously
    void this.runTurn(active)
  }

  async cancel(chatId: string): Promise<void> {
    const active = this.activeTurns.get(chatId)
    if (!active) return

    active.cancelRequested = true

    const pendingTool = active.pendingTool
    active.pendingTool = null

    if (pendingTool) {
      const result = discardedToolResult(pendingTool.tool)
      this.publishTranscript(
        chatId,
        timestamped({ kind: "tool_result", toolId: pendingTool.toolUseId, content: result })
      )
      if (active.provider === "codex" && pendingTool.tool.toolKind === "exit_plan_mode") {
        pendingTool.resolve(result)
      }
    }

    this.publishTranscript(chatId, timestamped({ kind: "interrupted" }))
    this.publishEvent(chatId, { type: "turn_cancelled", chatId })
    active.cancelRecorded = true
    active.hasFinalResult = true

    try {
      await active.turn.interrupt()
    } catch {
      active.turn.close()
    }

    this.activeTurns.delete(chatId)
  }

  async respondTool(chatId: string, toolUseId: string, result: unknown): Promise<void> {
    const active = this.activeTurns.get(chatId)
    if (!active?.pendingTool) throw new Error("No pending tool request")
    if (active.pendingTool.toolUseId !== toolUseId) throw new Error("Tool response does not match active request")

    const pending = active.pendingTool
    this.publishTranscript(
      chatId,
      timestamped({ kind: "tool_result", toolId: toolUseId, content: result })
    )

    active.pendingTool = null
    active.status = "running"

    this.publishEvent(chatId, { type: "pending_tool", chatId, tool: null })
    this.publishEvent(chatId, { type: "status_change", chatId, status: "running" })

    // Handle exit_plan_mode follow-up for Codex
    if (pending.tool.toolKind === "exit_plan_mode") {
      const res = (result ?? {}) as { confirmed?: boolean; clearContext?: boolean; message?: string }
      if (res.confirmed && res.clearContext) {
        this.publishEvent(chatId, { type: "session_token", chatId, sessionToken: "" })
        this.publishTranscript(chatId, timestamped({ kind: "context_cleared" }))
      }
      if (active.provider === "codex") {
        active.postToolFollowUp = res.confirmed
          ? {
              content: res.message
                ? `Proceed with the approved plan. Additional guidance: ${res.message}`
                : "Proceed with the approved plan.",
              planMode: false,
            }
          : {
              content: res.message
                ? `Revise the plan using this feedback: ${res.message}`
                : "Revise the plan using this feedback.",
              planMode: true,
            }
      }
    }

    pending.resolve(result)
  }

  // ── Private ───────────────────────────────────────────────────────

  private async generateTitleInBackground(chatId: string, content: string, cwd: string): Promise<void> {
    if (!this.generateTitle) return
    try {
      const title = await this.generateTitle(content, cwd)
      if (!title) return
      this.publishEvent(chatId, { type: "title_generated", chatId, title })
    } catch {
      // Ignore background title generation failures
    }
  }

  private async runTurn(active: ActiveTurn): Promise<void> {
    try {
      for await (const event of active.turn.stream) {
        if (event.type === "session_token" && event.sessionToken) {
          this.publishEvent(active.chatId, {
            type: "session_token",
            chatId: active.chatId,
            sessionToken: event.sessionToken,
          })
          continue
        }

        if (!event.entry) continue

        // After cancel, suppress final-state entries
        if (active.cancelRequested && (event.entry.kind === "result" || event.entry.kind === "interrupted")) {
          continue
        }

        this.publishTranscript(active.chatId, event.entry)

        if (event.entry.kind === "system_init") {
          active.status = "running"
          this.publishEvent(active.chatId, {
            type: "status_change",
            chatId: active.chatId,
            status: "running",
          })
        }

        if (event.entry.kind === "result") {
          active.hasFinalResult = true
          if (event.entry.isError) {
            this.publishEvent(active.chatId, {
              type: "turn_failed",
              chatId: active.chatId,
              error: event.entry.result || "Turn failed",
            })
          } else if (!active.cancelRequested) {
            this.publishEvent(active.chatId, {
              type: "turn_finished",
              chatId: active.chatId,
            })
          }
        }
      }
    } catch (error) {
      if (!active.cancelRequested) {
        const message = error instanceof Error ? error.message : String(error)
        this.publishTranscript(
          active.chatId,
          timestamped({ kind: "result", subtype: "error", isError: true, durationMs: 0, result: message })
        )
        this.publishEvent(active.chatId, {
          type: "turn_failed",
          chatId: active.chatId,
          error: message,
        })
      }
    } finally {
      if (active.cancelRequested && !active.cancelRecorded) {
        this.publishEvent(active.chatId, { type: "turn_cancelled", chatId: active.chatId })
      }
      active.turn.close()
      this.activeTurns.delete(active.chatId)

      // Handle follow-up turn (Codex exit_plan_mode)
      if (active.postToolFollowUp && !active.cancelRequested) {
        try {
          await this.startTurn({
            ...active.originalCmd,
            content: active.postToolFollowUp.content,
            planMode: active.postToolFollowUp.planMode,
            appendUserPrompt: false,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.publishTranscript(
            active.chatId,
            timestamped({ kind: "result", subtype: "error", isError: true, durationMs: 0, result: message })
          )
          this.publishEvent(active.chatId, { type: "turn_failed", chatId: active.chatId, error: message })
        }
      }
    }
  }
}
