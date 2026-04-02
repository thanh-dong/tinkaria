import { describe, expect, test } from "bun:test"
import {
  computeTailOffset,
  getActiveChatSnapshot,
  getNewestRemainingChatId,
  normalizeLocalFilePreviewErrorMessage,
  getUiUpdateRestartReconnectAction,
  resolveComposeIntent,
  shouldAutoFollowTranscript,
  TRANSCRIPT_TAIL_SIZE,
} from "./useKannaState"
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
    ).toBe("This Kanna browser client is newer than the running server. Restart Kanna to enable in-app file previews.")
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

describe("appendQueuedText", () => {
  test("uses the incoming text when the queue is empty", async () => {
    const module = await import("./useKannaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("", "Check layout")).toBe("Check layout")
    expect(append("   ", "Check layout")).toBe("Check layout")
  })

  test("uses the current text when the incoming text is blank", async () => {
    const module = await import("./useKannaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("Check layout", "   ")).toBe("Check layout")
  })

  test("appends a blank line between queued paragraphs", async () => {
    const module = await import("./useKannaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("  Check layout  ", "  Verify sidebar  ")).toBe("Check layout\n\nVerify sidebar")
    expect(append("Check layout", "Verify sidebar")).toBe("Check layout\n\nVerify sidebar")
  })
})

describe("shouldQueueChatSubmit", () => {
  test("returns false when runtime is idle and no queue exists", async () => {
    const module = await import("./useKannaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(false, "")).toBe(false)
    expect(shouldQueue(false, "   ")).toBe(false)
  })

  test("returns true when queued text already exists even if runtime is idle", async () => {
    const module = await import("./useKannaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(false, "Existing queued text")).toBe(true)
  })

  test("returns true when the runtime is busy", async () => {
    const module = await import("./useKannaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(true, "")).toBe(true)
  })
})

describe("shouldFlushQueuedText", () => {
  test("returns true only when the queued text belongs to the active idle chat", async () => {
    const module = await import("./useKannaState")
    const shouldFlush = (module as Record<string, unknown>).shouldFlushQueuedText

    expect(typeof shouldFlush).toBe("function")
    if (typeof shouldFlush !== "function") throw new Error("shouldFlushQueuedText export missing")

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: false,
    })).toBe(true)

    expect(shouldFlush({
      activeChatId: "chat-2",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: false,
    })).toBe(false)
  })

  test("returns false while processing, in flight, or blank", async () => {
    const module = await import("./useKannaState")
    const shouldFlush = (module as Record<string, unknown>).shouldFlushQueuedText

    expect(typeof shouldFlush).toBe("function")
    if (typeof shouldFlush !== "function") throw new Error("shouldFlushQueuedText export missing")

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: true,
      isFlushInFlight: false,
    })).toBe(false)

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "Queued follow-up",
      isProcessing: false,
      isFlushInFlight: true,
    })).toBe(false)

    expect(shouldFlush({
      activeChatId: "chat-1",
      queuedChatId: "chat-1",
      queuedText: "   ",
      isProcessing: false,
      isFlushInFlight: false,
    })).toBe(false)
  })
})

describe("consumeFlushedQueuedText", () => {
  test("clears the queue when the flushed text matches the entire queue", async () => {
    const module = await import("./useKannaState")
    const consume = (module as Record<string, unknown>).consumeFlushedQueuedText

    expect(typeof consume).toBe("function")
    if (typeof consume !== "function") throw new Error("consumeFlushedQueuedText export missing")

    expect(consume("Queued follow-up", "Queued follow-up")).toBe("")
  })

  test("preserves newer queued text appended during an in-flight flush", async () => {
    const module = await import("./useKannaState")
    const consume = (module as Record<string, unknown>).consumeFlushedQueuedText

    expect(typeof consume).toBe("function")
    if (typeof consume !== "function") throw new Error("consumeFlushedQueuedText export missing")

    expect(consume("First message\n\nSecond message", "First message")).toBe("Second message")
    expect(consume("Second message", "First message")).toBe("Second message")
  })
})
