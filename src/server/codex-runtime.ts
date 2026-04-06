import type { HarnessTurn } from "./harness-types"
import { CodexAppServerManager, type StartCodexSessionArgs, type StartCodexTurnArgs } from "./codex-app-server"

export interface StartCodexRuntimeSessionArgs extends StartCodexSessionArgs {
  projectId: string
}

export interface CodexRuntime {
  startSession(args: StartCodexRuntimeSessionArgs): Promise<void>
  startTurn(args: StartCodexTurnArgs): Promise<HarnessTurn>
  stopSession(chatId: string): void
}

export class InProcessCodexRuntime implements CodexRuntime {
  constructor(private readonly manager: CodexAppServerManager = new CodexAppServerManager()) {}

  async startSession(args: StartCodexRuntimeSessionArgs): Promise<void> {
    await this.manager.startSession(args)
  }

  async startTurn(args: StartCodexTurnArgs): Promise<HarnessTurn> {
    return await this.manager.startTurn(args)
  }

  stopSession(chatId: string): void {
    this.manager.stopSession(chatId)
  }
}
