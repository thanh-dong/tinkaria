import { describe, expect, test } from "bun:test"

import type { ClientCommand } from "./protocol"
import type {
  NativeWebviewCommand,
  NativeWebviewDockState,
  NativeWebviewSnapshot,
  NativeWebviewTargetKind,
} from "./native-webview"

describe("native webview protocol types", () => {
  test("accepts a native webview open command", () => {
    const command: NativeWebviewCommand = {
      type: "webview.open",
      rendererId: "desktop-1",
      webviewId: "preview",
      targetKind: "local-port",
      target: "http://127.0.0.1:3210",
      dockState: "docked",
    }

    expect(command.type).toBe("webview.open")
  })

  test("accepts a native webview close command", () => {
    const command: NativeWebviewCommand = {
      type: "webview.close",
      rendererId: "desktop-1",
      webviewId: "preview",
    }

    expect(command.type).toBe("webview.close")
  })

  test("fits into the shared client command union", () => {
    const openCommand: ClientCommand = {
      type: "webview.open",
      rendererId: "desktop-1",
      webviewId: "preview",
      targetKind: "kanna-ui",
      target: "http://127.0.0.1:3210",
      dockState: "popped_out",
    }

    const closeCommand: ClientCommand = {
      type: "webview.close",
      rendererId: "desktop-1",
      webviewId: "preview",
    }

    expect(openCommand.type).toBe("webview.open")
    expect(closeCommand.type).toBe("webview.close")
  })

  test("models a native webview snapshot", () => {
    const targetKind: NativeWebviewTargetKind = "proxied-remote"
    const dockState: NativeWebviewDockState = "popped_out"
    const snapshot: NativeWebviewSnapshot = {
      webviewId: "preview",
      targetKind,
      target: "https://example.com",
      dockState,
      status: "ready",
    }

    expect(snapshot.status).toBe("ready")
  })
})
