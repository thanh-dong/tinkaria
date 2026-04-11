import type {
  AgentProvider,
  ModelOptions,
} from "./types"

export type SubscriptionTopic =
  | { type: "sidebar" }
  | { type: "local-projects" }
  | { type: "update" }
  | { type: "chat"; chatId: string }
  | { type: "terminal"; terminalId: string }
  | { type: "sessions"; projectId: string }
  | { type: "orchestration"; chatId: string }
  | { type: "project"; projectId: string }

export interface TerminalSnapshot {
  terminalId: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  scrollback: number
  serializedState: string
  status: "running" | "exited"
  exitCode: number | null
  signal?: number
}

export type TerminalEvent =
  | { type: "terminal.output"; terminalId: string; data: string }
  | { type: "terminal.exit"; terminalId: string; exitCode: number; signal?: number }

export type ClientCommand =
  | { type: "project.open"; localPath: string }
  | { type: "project.create"; localPath: string; title: string }
  | { type: "project.remove"; projectId: string }
  | { type: "system.ping" }
  | { type: "update.check"; force?: boolean }
  | { type: "update.install" }
  | {
      type: "system.openExternal"
      localPath: string
      action: "open_finder" | "open_terminal"
    }
  | {
      type: "system.readLocalFilePreview"
      localPath: string
    }
  | { type: "chat.create"; projectId: string }
  | { type: "chat.rename"; chatId: string; title: string }
  | { type: "chat.delete"; chatId: string }
  | { type: "chat.markRead"; chatId: string }
  | {
      type: "chat.send"
      chatId?: string
      projectId?: string
      provider?: AgentProvider
      content: string
      model?: string
      modelOptions?: ModelOptions
      effort?: string
      planMode?: boolean
    }
  | { type: "chat.cancel"; chatId: string }
  | { type: "chat.respondTool"; chatId: string; toolUseId: string; result: unknown }
  | { type: "chat.generateForkPrompt"; chatId: string; intent: string; preset?: string }
  | { type: "chat.generateMergePrompt"; chatIds: string[]; intent: string; preset?: string }
  | { type: "chat.getSessionRuntime"; chatId: string }
  | { type: "chat.getRepoStatus"; chatId: string }
  | { type: "terminal.create"; projectId: string; terminalId: string; cols: number; rows: number; scrollback: number }
  | { type: "terminal.input"; terminalId: string; data: string }
  | { type: "terminal.resize"; terminalId: string; cols: number; rows: number }
  | { type: "terminal.close"; terminalId: string }
  | { type: "chat.getMessages"; chatId: string; offset?: number; limit?: number }
  | { type: "snapshot.subscribe"; subscriptionId: string; topic: SubscriptionTopic }
  | { type: "snapshot.unsubscribe"; subscriptionId: string }
  | { type: "sessions.resume"; projectId: string; sessionId: string; provider: AgentProvider }
  | { type: "sessions.refresh"; projectId: string }
  | { type: "project.todo.add"; projectId: string; todoId: string; description: string; priority?: "high" | "normal" | "low"; createdBy?: string }
  | { type: "project.todo.claim"; projectId: string; todoId: string; sessionId: string }
  | { type: "project.todo.complete"; projectId: string; todoId: string; outputs: string[] }
  | { type: "project.todo.abandon"; projectId: string; todoId: string }
  | { type: "project.claim.create"; projectId: string; claimId: string; intent: string; files: string[]; sessionId: string }
  | { type: "project.claim.release"; projectId: string; claimId: string }
  | { type: "project.worktree.create"; projectId: string; worktreeId: string; branch: string; baseBranch?: string }
  | { type: "project.worktree.assign"; projectId: string; worktreeId: string; sessionId: string }
  | { type: "project.worktree.remove"; projectId: string; worktreeId: string }
  | { type: "project.rule.set"; projectId: string; ruleId: string; content: string; setBy: string }
  | { type: "project.rule.remove"; projectId: string; ruleId: string }
  | { type: "project.coordination.snapshot"; projectId: string }
