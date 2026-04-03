import { describe, expect, test } from "bun:test"
import {
  computeTailOffset,
  getActiveChatSnapshot,
  getInitialChatScrollTarget,
  getNewestRemainingChatId,
  getReadTimestampToPersistAfterReply,
  isChatRead,
  normalizeLocalFilePreviewErrorMessage,
  getUiUpdateRestartReconnectAction,
  resolveComposeIntent,
  resolveDesktopWebviewOpenCommand,
  shouldAutoFollowTranscript,
  shouldStickToBottomOnComposerSubmit,
  TRANSCRIPT_TAIL_SIZE,
} from "./useTinkariaState"
import type { ChatSnapshot, SidebarData } from "../../shared/types"

function createSidebarData(): SidebarData {
  return {
    projectGroups: [
      {
        groupKey: "project-1",
        localPath: "/tmp/project-1",
        chats: [
          {
            _id: "row-1",
            _creationTime: 3,
            chatId: "chat-3",
            title: "Newest",
            status: "idle",
            localPath: "/tmp/project-1",
            provider: null,
            lastMessageAt: 3,
            hasAutomation: false,
          },
          {
            _id: "row-2",
            _creationTime: 2,
            chatId: "chat-2",
            title: "Older",
            status: "idle",
            localPath: "/tmp/project-1",
            provider: null,
            lastMessageAt: 2,
            hasAutomation: false,
          },
          {
            _id: "row-3",
            _creationTime: 1,
            chatId: "chat-1",
            title: "Oldest",
            status: "idle",
            localPath: "/tmp/project-1",
            provider: null,
            lastMessageAt: 1,
            hasAutomation: false,
          },
        ],
      },
      {
        groupKey: "project-2",
        localPath: "/tmp/project-2",
        chats: [
          {
            _id: "row-4",
            _creationTime: 1,
            chatId: "chat-4",
            title: "Other project",
            status: "idle",
            localPath: "/tmp/project-2",
            provider: null,
            lastMessageAt: 1,
            hasAutomation: false,
          },
        ],
      },
    ],
  }
}

describe("getNewestRemainingChatId", () => {
  test("returns the next newest chat from the same project", () => {
    const sidebarData = createSidebarData()

    expect(getNewestRemainingChatId(sidebarData.projectGroups, "chat-3")).toBe("chat-2")
  })

  test("returns null when no other chats remain in the project", () => {
    const sidebarData = createSidebarData()

    expect(getNewestRemainingChatId(sidebarData.projectGroups, "chat-4")).toBeNull()
  })

  test("returns null when the chat is not found", () => {
    const sidebarData = createSidebarData()

    expect(getNewestRemainingChatId(sidebarData.projectGroups, "missing")).toBeNull()
  })
})

describe("shouldAutoFollowTranscript", () => {
  test("returns true when the transcript is at the bottom", () => {
    expect(shouldAutoFollowTranscript(0)).toBe(true)
  })

  test("returns true when the transcript is near the bottom", () => {
    expect(shouldAutoFollowTranscript(23)).toBe(true)
  })

  test("returns false when the transcript is not near the bottom", () => {
    expect(shouldAutoFollowTranscript(24)).toBe(false)
  })
})

describe("shouldStickToBottomOnComposerSubmit", () => {
  test("keeps bottom follow for composer submits that happen near the tail", () => {
    expect(shouldStickToBottomOnComposerSubmit(0)).toBe(true)
    expect(shouldStickToBottomOnComposerSubmit(96)).toBe(true)
    expect(shouldStickToBottomOnComposerSubmit(97)).toBe(false)
  })
})

describe("getUiUpdateRestartReconnectAction", () => {
  test("waits for reconnect after the socket disconnects", () => {
    expect(getUiUpdateRestartReconnectAction("awaiting_disconnect", "disconnected")).toBe("awaiting_reconnect")
  })

  test("navigates to changelog after reconnect", () => {
    expect(getUiUpdateRestartReconnectAction("awaiting_reconnect", "connected")).toBe("navigate_changelog")
  })

  test("does nothing for unrelated phase and connection combinations", () => {
    expect(getUiUpdateRestartReconnectAction(null, "connected")).toBe("none")
    expect(getUiUpdateRestartReconnectAction("awaiting_disconnect", "connected")).toBe("none")
    expect(getUiUpdateRestartReconnectAction("awaiting_reconnect", "disconnected")).toBe("none")
  })
})

describe("normalizeLocalFilePreviewErrorMessage", () => {
  test("rewrites the stale server preview-command error into a restart hint", () => {
    expect(
      normalizeLocalFilePreviewErrorMessage(new Error("Unknown command type: system.readLocalFilePreview"))
    ).toBe("This Tinkaria browser client is newer than the running server. Restart Tinkaria to enable in-app file previews.")
  })

  test("passes through unrelated errors", () => {
    expect(normalizeLocalFilePreviewErrorMessage(new Error("Path not found"))).toBe("Path not found")
  })
})

describe("resolveComposeIntent", () => {
  test("prefers the selected project when available", () => {
    expect(
      resolveComposeIntent({
        selectedProjectId: "project-selected",
        sidebarProjectId: "project-sidebar",
        fallbackLocalProjectPath: "/tmp/project",
      })
    ).toEqual({ kind: "project_id", projectId: "project-selected" })
  })

  test("falls back to the first sidebar project", () => {
    expect(
      resolveComposeIntent({
        selectedProjectId: null,
        sidebarProjectId: "project-sidebar",
        fallbackLocalProjectPath: "/tmp/project",
      })
    ).toEqual({ kind: "project_id", projectId: "project-sidebar" })
  })

  test("uses the first local project path when no project is selected", () => {
    expect(
      resolveComposeIntent({
        selectedProjectId: null,
        sidebarProjectId: null,
        fallbackLocalProjectPath: "/tmp/project",
      })
    ).toEqual({ kind: "local_path", localPath: "/tmp/project" })
  })

  test("returns null when no project target exists", () => {
    expect(
      resolveComposeIntent({
        selectedProjectId: null,
        sidebarProjectId: null,
        fallbackLocalProjectPath: null,
      })
    ).toBeNull()
  })
})

describe("resolveDesktopWebviewOpenCommand", () => {
  test("returns null when no native desktop renderer is available", () => {
    expect(resolveDesktopWebviewOpenCommand({
      href: "https://example.com/demo",
      desktopRenderers: {
        renderers: [
          {
            rendererId: "desktop-1",
            machineName: "Workstation",
            capabilities: ["something_else"],
            serverUrl: null,
            natsUrl: null,
            lastError: null,
            connectedAt: 10,
            lastSeenAt: 10,
          },
        ],
      },
    })).toBeNull()
  })

  test("targets the first available renderer for localhost content", () => {
    expect(resolveDesktopWebviewOpenCommand({
      href: "http://127.0.0.1:3210/local",
      desktopRenderers: {
        renderers: [
          {
            rendererId: "desktop-1",
            machineName: "Workstation",
            capabilities: ["native_webview"],
            serverUrl: null,
            natsUrl: null,
            lastError: null,
            connectedAt: 10,
            lastSeenAt: 10,
          },
        ],
      },
    })).toEqual({
      type: "webview.open",
      rendererId: "desktop-1",
      webviewId: "controlled-content",
      targetKind: "local-port",
      target: "http://127.0.0.1:3210/local",
      dockState: "docked",
    })
  })

  test("classifies private network hosts as lan-host targets", () => {
    expect(resolveDesktopWebviewOpenCommand({
      href: "http://192.168.1.10:8080",
      desktopRenderers: {
        renderers: [
          {
            rendererId: "desktop-1",
            machineName: "Workstation",
            capabilities: ["native_webview"],
            serverUrl: null,
            natsUrl: null,
            lastError: null,
            connectedAt: 10,
            lastSeenAt: 10,
          },
        ],
      },
    })).toEqual({
      type: "webview.open",
      rendererId: "desktop-1",
      webviewId: "controlled-content",
      targetKind: "lan-host",
      target: "http://192.168.1.10:8080/",
      dockState: "docked",
    })
  })

  test("classifies public https targets as proxied-remote", () => {
    expect(resolveDesktopWebviewOpenCommand({
      href: "https://example.com/demo",
      desktopRenderers: {
        renderers: [
          {
            rendererId: "desktop-1",
            machineName: "Workstation",
            capabilities: ["native_webview"],
            serverUrl: null,
            natsUrl: null,
            lastError: null,
            connectedAt: 10,
            lastSeenAt: 10,
          },
        ],
      },
    })).toEqual({
      type: "webview.open",
      rendererId: "desktop-1",
      webviewId: "controlled-content",
      targetKind: "proxied-remote",
      target: "https://example.com/demo",
      dockState: "docked",
    })
  })
})

describe("getActiveChatSnapshot", () => {
  test("returns the snapshot when it matches the active chat id", () => {
    const snapshot: ChatSnapshot = {
      runtime: {
        chatId: "chat-1",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Chat 1",
        status: "idle",
        provider: "codex",
        planMode: false,
        sessionToken: null,
      },
      messageCount: 0,
      availableProviders: [],
    }

    expect(getActiveChatSnapshot(snapshot, "chat-1")).toEqual(snapshot)
  })

  test("returns null for a stale snapshot from a previous route", () => {
    const snapshot: ChatSnapshot = {
      runtime: {
        chatId: "chat-old",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Old chat",
        status: "idle",
        provider: "claude",
        planMode: false,
        sessionToken: null,
      },
      messageCount: 0,
      availableProviders: [],
    }

    expect(getActiveChatSnapshot(snapshot, "chat-new")).toBeNull()
  })
})

describe("computeTailOffset", () => {
  test("returns 0 for transcripts smaller than tail size", () => {
    expect(computeTailOffset(0)).toBe(0)
    expect(computeTailOffset(50)).toBe(0)
    expect(computeTailOffset(TRANSCRIPT_TAIL_SIZE)).toBe(0)
  })

  test("returns offset that fetches the last TAIL_SIZE entries", () => {
    expect(computeTailOffset(1065)).toBe(1065 - TRANSCRIPT_TAIL_SIZE)
    expect(computeTailOffset(500)).toBe(500 - TRANSCRIPT_TAIL_SIZE)
  })

  test("accepts custom tail size", () => {
    expect(computeTailOffset(1000, 100)).toBe(900)
    expect(computeTailOffset(50, 100)).toBe(0)
  })

  test("TRANSCRIPT_TAIL_SIZE is 200", () => {
    expect(TRANSCRIPT_TAIL_SIZE).toBe(200)
  })
})

describe("isChatRead", () => {
  test("treats chats with unseen newer messages as unread", () => {
    expect(isChatRead(10, 11)).toBe(false)
  })

  test("treats chats with matching last seen timestamps as read", () => {
    expect(isChatRead(11, 11)).toBe(true)
    expect(isChatRead(12, 11)).toBe(true)
  })

  test("treats chats without message timestamps as read", () => {
    expect(isChatRead(undefined, undefined)).toBe(true)
    expect(isChatRead(undefined, 11)).toBe(false)
  })
})

describe("getReadTimestampToPersistAfterReply", () => {
  test("promotes the latest visible message to read after a successful reply", () => {
    const persistedReadAt = getReadTimestampToPersistAfterReply(10, 11)

    expect(persistedReadAt).toBe(11)
    expect(isChatRead(persistedReadAt ?? undefined, 11)).toBe(true)
    expect(getInitialChatScrollTarget({
      activeChatId: "chat-1",
      runtime: {
        chatId: "chat-1",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Chat 1",
        status: "idle",
        provider: "codex",
        planMode: false,
        sessionToken: null,
      },
      sidebarReady: true,
      hasSidebarChat: true,
      isRead: isChatRead(persistedReadAt ?? undefined, 11),
    })).toBe("bottom")
  })

  test("does nothing when the chat has no latest message timestamp yet", () => {
    expect(getReadTimestampToPersistAfterReply(10, undefined)).toBeNull()
  })
})

describe("getInitialChatScrollTarget", () => {
  test("waits for the runtime before deciding on an existing chat route", () => {
    expect(getInitialChatScrollTarget({
      activeChatId: "chat-1",
      runtime: null,
      sidebarReady: true,
      hasSidebarChat: true,
      isRead: false,
    })).toBe("wait")
  })

  test("waits for the sidebar row before deciding whether the chat is read", () => {
    expect(getInitialChatScrollTarget({
      activeChatId: "chat-1",
      runtime: {
        chatId: "chat-1",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Chat 1",
        status: "idle",
        provider: "codex",
        planMode: false,
        sessionToken: null,
      },
      sidebarReady: false,
      hasSidebarChat: false,
      isRead: true,
    })).toBe("wait")
  })

  test("opens unread chats at the top once the runtime is ready", () => {
    expect(getInitialChatScrollTarget({
      activeChatId: "chat-1",
      runtime: {
        chatId: "chat-1",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Unread chat",
        status: "idle",
        provider: "codex",
        planMode: false,
        sessionToken: null,
      },
      sidebarReady: true,
      hasSidebarChat: true,
      isRead: false,
    })).toBe("top")
  })

  test("opens read chats at the bottom once the runtime is ready", () => {
    expect(getInitialChatScrollTarget({
      activeChatId: "chat-1",
      runtime: {
        chatId: "chat-1",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Read chat",
        status: "idle",
        provider: "claude",
        planMode: false,
        sessionToken: null,
      },
      sidebarReady: true,
      hasSidebarChat: true,
      isRead: true,
    })).toBe("bottom")
  })
})

describe("appendQueuedText", () => {
  test("uses the incoming text when the queue is empty", async () => {
    const module = await import("./useTinkariaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("", "Check layout")).toBe("Check layout")
    expect(append("   ", "Check layout")).toBe("Check layout")
  })

  test("uses the current text when the incoming text is blank", async () => {
    const module = await import("./useTinkariaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("Check layout", "   ")).toBe("Check layout")
  })

  test("appends a blank line between queued paragraphs", async () => {
    const module = await import("./useTinkariaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("  Check layout  ", "  Verify sidebar  ")).toBe("Check layout\n\nVerify sidebar")
    expect(append("Check layout", "Verify sidebar")).toBe("Check layout\n\nVerify sidebar")
  })
})

describe("shouldQueueChatSubmit", () => {
  test("returns false when runtime is idle and no queue exists", async () => {
    const module = await import("./useTinkariaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(false, "")).toBe(false)
    expect(shouldQueue(false, "   ")).toBe(false)
  })

  test("returns true when queued text already exists even if runtime is idle", async () => {
    const module = await import("./useTinkariaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(false, "Existing queued text")).toBe(true)
  })

  test("returns true when the runtime is busy", async () => {
    const module = await import("./useTinkariaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(true, "")).toBe(true)
  })
})

describe("shouldFlushQueuedText", () => {
  test("returns true only when the queued text belongs to the active idle chat", async () => {
    const module = await import("./useTinkariaState")
    const shouldFlush = (module as Record<string, unknown>).shouldFlushQueuedText

    expect(typeof shouldFlush).toBe("function")
    if (typeof shouldFlush !== "function") throw new Error("shouldFlushQueuedText export missing")

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: false,
      isAwaitingPostFlushBusy: false,
    })).toBe(true)

    expect(shouldFlush({
      activeChatId: "chat-2",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: false,
      isAwaitingPostFlushBusy: false,
    })).toBe(false)
  })

  test("returns false while processing, in flight, or blank", async () => {
    const module = await import("./useTinkariaState")
    const shouldFlush = (module as Record<string, unknown>).shouldFlushQueuedText

    expect(typeof shouldFlush).toBe("function")
    if (typeof shouldFlush !== "function") throw new Error("shouldFlushQueuedText export missing")

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: true,
      isFlushInFlight: false,
      isAwaitingPostFlushBusy: false,
    })).toBe(false)

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: true,
      isAwaitingPostFlushBusy: false,
    })).toBe(false)

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: false,
      isAwaitingPostFlushBusy: true,
    })).toBe(false)

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "   ",
      isProcessing: false,
      isFlushInFlight: false,
      isAwaitingPostFlushBusy: false,
    })).toBe(false)
  })
})

describe("prependQueuedText", () => {
  test("restores a failed flushed message ahead of newer queued text", async () => {
    const module = await import("./useTinkariaState")
    const prepend = (module as Record<string, unknown>).prependQueuedText

    expect(typeof prepend).toBe("function")
    if (typeof prepend !== "function") throw new Error("prependQueuedText export missing")

    expect(prepend("First message", "")).toBe("First message")
    expect(prepend("First message", "Second message")).toBe("First message\n\nSecond message")
  })
})
