import type {
  AgentProvider,
  KeybindingsSnapshot,
  ModelOptions,
} from "./types"
import type {
  NativeWebviewDockState,
  NativeWebviewTargetKind,
} from "./native-webview"

export type EditorPreset = "cursor" | "vscode" | "windsurf" | "custom"

export interface EditorOpenSettings {
  preset: EditorPreset
  commandTemplate: string
}

export type SubscriptionTopic =
  | { type: "sidebar" }
  | { type: "local-projects" }
  | { type: "desktop-renderers" }
  | { type: "update" }
  | { type: "keybindings" }
  | { type: "chat"; chatId: string }
  | { type: "terminal"; terminalId: string }
  | { type: "sessions"; projectId: string }

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
  | {
      type: "desktop.register"
      rendererId: string
      machineName: string
      capabilities: string[]
      serverUrl?: string | null
      natsUrl?: string | null
      lastError?: string | null
    }
  | { type: "desktop.unregister"; rendererId: string }
  | { type: "system.ping" }
  | { type: "update.check"; force?: boolean }
  | { type: "update.install" }
  | { type: "settings.readKeybindings" }
  | { type: "settings.writeKeybindings"; bindings: KeybindingsSnapshot["bindings"] }
  | {
      type: "system.openExternal"
      localPath: string
      action: "open_finder" | "open_terminal" | "open_editor"
      line?: number
      column?: number
      editor?: EditorOpenSettings
    }
  | {
      type: "system.readLocalFilePreview"
      localPath: string
    }
  | { type: "chat.create"; projectId: string }
  | { type: "chat.rename"; chatId: string; title: string }
  | { type: "chat.delete"; chatId: string }
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
  | { type: "chat.getSessionRuntime"; chatId: string }
  | { type: "terminal.create"; projectId: string; terminalId: string; cols: number; rows: number; scrollback: number }
  | { type: "terminal.input"; terminalId: string; data: string }
  | { type: "terminal.resize"; terminalId: string; cols: number; rows: number }
  | { type: "terminal.close"; terminalId: string }
  | { type: "chat.getMessages"; chatId: string; offset?: number; limit?: number }
  | { type: "snapshot.subscribe"; subscriptionId: string; topic: SubscriptionTopic }
  | { type: "snapshot.unsubscribe"; subscriptionId: string }
  | { type: "sessions.resume"; projectId: string; sessionId: string; provider: AgentProvider }
  | { type: "sessions.refresh"; projectId: string }
  | {
      type: "webview.open"
      rendererId: string
      webviewId: string
      targetKind: NativeWebviewTargetKind
      target: string
      dockState: NativeWebviewDockState
    }
  | {
      type: "webview.close"
      rendererId: string
      webviewId: string
    }
