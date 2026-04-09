import type { CodexReasoningEffort, ServiceTier } from "../shared/types"
import type { HarnessToolRequest, HarnessTurn } from "./harness-types"
import type { SessionOrchestrator } from "./orchestration"
import type { CodexRuntime, StartCodexRuntimeSessionArgs } from "./codex-runtime"
import { CodexAppServerManager, type StartCodexTurnArgs } from "./codex-app-server"
import { InProcessCodexRuntime } from "./codex-runtime"

export interface CodexHarnessBinding {
  startSession(args: StartCodexRuntimeSessionArgs): Promise<void>
  startTurn(args: StartCodexTurnArgs): Promise<HarnessTurn>
  stopSession(chatId: string): void
}

export function createDefaultCodexHarnessBinding(
  manager: CodexAppServerManager = new CodexAppServerManager(),
): CodexRuntime {
  return new InProcessCodexRuntime(manager)
}

export async function startCodexTurn(args: {
  binding: CodexHarnessBinding
  chatId: string
  projectId: string
  localPath: string
  content: string
  model: string
  effort?: CodexReasoningEffort
  serviceTier?: ServiceTier
  planMode: boolean
  skills?: string[]
  orchestrator?: SessionOrchestrator
  orchestrationChatId?: string
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
}): Promise<HarnessTurn> {
  await args.binding.startSession({
    chatId: args.chatId,
    projectId: args.projectId,
    cwd: args.localPath,
    model: args.model,
    serviceTier: args.serviceTier,
    sessionToken: args.sessionToken,
  })

  return await args.binding.startTurn({
    chatId: args.chatId,
    content: args.content,
    model: args.model,
    effort: args.effort,
    serviceTier: args.serviceTier,
    planMode: args.planMode,
    skills: args.skills,
    orchestrator: args.orchestrator,
    orchestrationChatId: args.orchestrationChatId,
    onToolRequest: args.onToolRequest,
  })
}
