/**
 * Turn factory wrappers for the runner process.
 *
 * Re-exports startClaudeTurn from claude-harness.ts and provides startCodexTurn
 * so the runner can create harness turns for both providers.
 */

export { startClaudeTurn } from "../server/claude-harness"

import { CodexAppServerManager } from "../server/codex-app-server"
import type { HarnessToolRequest, HarnessTurn } from "../shared/harness-types"
import type { CodexReasoningEffort, ServiceTier } from "../shared/types"

// Singleton: one CodexAppServerManager per runner process, manages all Codex child processes.
let codexManager: CodexAppServerManager | null = null

function getCodexManager(binaryPath?: string, extraEnv?: Record<string, string>): CodexAppServerManager {
  if (!codexManager) {
    codexManager = new CodexAppServerManager({ binaryPath, extraEnv })
  }
  return codexManager
}

export async function startCodexTurn(args: {
  chatId: string
  content: string
  localPath: string
  model: string
  effort?: string
  serviceTier?: "fast"
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  binaryPath?: string
  extraEnv?: Record<string, string>
}): Promise<HarnessTurn> {
  const manager = getCodexManager(args.binaryPath, args.extraEnv)

  await manager.startSession({
    chatId: args.chatId,
    cwd: args.localPath,
    model: args.model,
    serviceTier: args.serviceTier as ServiceTier | undefined,
    sessionToken: args.sessionToken,
  })

  return await manager.startTurn({
    chatId: args.chatId,
    content: args.content,
    model: args.model,
    effort: args.effort as CodexReasoningEffort | undefined,
    serviceTier: args.serviceTier as ServiceTier | undefined,
    planMode: args.planMode,
    onToolRequest: args.onToolRequest,
  })
}

export function stopCodexSession(chatId: string): void {
  codexManager?.stopSession(chatId)
}

export function stopAllCodexSessions(): void {
  codexManager?.stopAll()
}
