import type {
  AgentProvider,
  ModelOptions,
} from "./types"

export type SubscriptionTopic =
  | { type: "sidebar" }
  | { type: "local-workspaces" }
  | { type: "update" }
  | { type: "chat"; chatId: string }
  | { type: "terminal"; terminalId: string }
  | { type: "sessions"; workspaceId: string }
  | { type: "orchestration"; chatId: string }
  | { type: "workspace"; workspaceId: string }

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
  | { type: "workspace.todo.add"; workspaceId: string; todoId: string; description: string; priority?: "high" | "normal" | "low"; createdBy?: string }
  | { type: "workspace.todo.claim"; workspaceId: string; todoId: string; sessionId: string }
  | { type: "workspace.todo.complete"; workspaceId: string; todoId: string; outputs: string[] }
  | { type: "workspace.todo.abandon"; workspaceId: string; todoId: string }
  | { type: "workspace.claim.create"; workspaceId: string; claimId: string; intent: string; files: string[]; sessionId: string }
  | { type: "workspace.claim.release"; workspaceId: string; claimId: string }
  | { type: "workspace.worktree.create"; workspaceId: string; worktreeId: string; branch: string; baseBranch?: string }
  | { type: "workspace.worktree.assign"; workspaceId: string; worktreeId: string; sessionId: string }
  | { type: "workspace.worktree.remove"; workspaceId: string; worktreeId: string }
  | { type: "workspace.rule.set"; workspaceId: string; ruleId: string; content: string; setBy: string }
  | { type: "workspace.rule.remove"; workspaceId: string; ruleId: string }
  | { type: "workspace.coordination.snapshot"; workspaceId: string }
