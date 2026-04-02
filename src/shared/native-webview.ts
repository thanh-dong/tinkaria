import type { ClientCommand } from "./protocol"

export type NativeWebviewTargetKind =
  | "kanna-ui"
  | "local-port"
  | "lan-host"
  | "proxied-remote"

export type NativeWebviewDockState = "docked" | "popped_out"

export interface NativeWebviewSnapshot {
  webviewId: string
  targetKind: NativeWebviewTargetKind
  target: string
  dockState: NativeWebviewDockState
  status: "idle" | "loading" | "ready" | "error"
}

export type NativeWebviewCommand = Extract<
  ClientCommand,
  { type: "webview.open" | "webview.close" }
>
