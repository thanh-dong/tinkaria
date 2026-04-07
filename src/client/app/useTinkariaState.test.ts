import { afterEach, describe, expect, test } from "bun:test"
import {
  computeTailOffset,
  getActiveChatSnapshot,
  getCachedChat,
  setCachedChat,
  deleteCachedChat,
  clearChatCache,
  markCachedChatsStale,
  MAX_CACHED_CHATS,
  getNextReadableBoundary,
  getReadableBlockCount,
  getInitialChatReadAnchor,
  getLockedInitialChatReadAnchor,
  getLastReadableMessage,
  getNewestRemainingChatId,
  getReadTimestampToPersistAfterReply,
  getResumeRefreshSessionProjectIds,
  isReadableTranscriptMessage,
  isChatRead,
  normalizeLocalFilePreviewErrorMessage,
  normalizeCommandErrorMessage,
  getUiUpdateRestartReconnectAction,
  resolveComposeIntent,
  hasRenderableTranscriptHistory,
  summarizeTranscriptWindow,
  shouldBackfillTranscriptWindow,
  shouldAutoFollowTranscript,
  shouldRefreshStaleSessionOnResume,
  shouldStickToBottomOnComposerSubmit,
  PWA_RESUME_STALE_AFTER_MS,
  TRANSCRIPT_TAIL_SIZE,
} from "./useTinkariaState"
import type { ChatSnapshot, HydratedTranscriptMessage, SidebarData } from "../../shared/types"
import { createIncrementalHydrator } from "../lib/parseTranscript"

function assistantMessage(id: string): HydratedTranscriptMessage {
  return {
    id,
    kind: "assistant_text",
    text: `message-${id}`,
    timestamp: "2026-04-01T00:00:00.000Z",
  }
}

function paragraphMessage(id: string, text: string): HydratedTranscriptMessage {
  return {
    id,
    kind: "assistant_text",
    text,
    timestamp: "2026-04-01T00:00:00.000Z",
  }
}

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

describe("shouldRefreshStaleSessionOnResume", () => {
  test("returns false outside standalone/PWA mode", () => {
    expect(shouldRefreshStaleSessionOnResume({
      isStandalone: false,
      hiddenAt: 1,
      resumedAt: 1 + PWA_RESUME_STALE_AFTER_MS + 1,
      connectionStatus: "connected",
    })).toBe(false)
  })

  test("returns true when a standalone session resumes after a long background gap", () => {
    expect(shouldRefreshStaleSessionOnResume({
      isStandalone: true,
      hiddenAt: 100,
      resumedAt: 100 + PWA_RESUME_STALE_AFTER_MS,
      connectionStatus: "connected",
    })).toBe(true)
  })

  test("returns true when the socket is not connected on resume", () => {
    expect(shouldRefreshStaleSessionOnResume({
      isStandalone: true,
      hiddenAt: null,
      resumedAt: Date.now(),
      connectionStatus: "disconnected",
    })).toBe(true)
  })

  test("returns false for short connected resumes", () => {
    expect(shouldRefreshStaleSessionOnResume({
      isStandalone: true,
      hiddenAt: 100,
      resumedAt: 100 + PWA_RESUME_STALE_AFTER_MS - 1,
      connectionStatus: "connected",
    })).toBe(false)
  })
})

describe("getResumeRefreshSessionProjectIds", () => {
  test("deduplicates open session picker project ids while preserving first-seen order", () => {
    expect(
      getResumeRefreshSessionProjectIds(["project-2", "project-1", "project-2", "project-3", "project-1"])
    ).toEqual(["project-2", "project-1", "project-3"])
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

describe("normalizeCommandErrorMessage", () => {
  test("rewrites transport not-connected errors into a user-facing setup hint", () => {
    expect(normalizeCommandErrorMessage(new Error("Not connected"))).toBe(
      "Can't reach your local Tinkaria server yet. Wait a moment, or start Tinkaria in a terminal on this machine and try again."
    )
  })

  test("rewrites dropped connection errors into a reconnect hint", () => {
    expect(normalizeCommandErrorMessage(new Error("Connection closed"))).toBe(
      "The connection to your local Tinkaria server dropped. Tinkaria will keep trying to reconnect."
    )
  })

  test("passes through unrelated command errors", () => {
    expect(normalizeCommandErrorMessage(new Error("Permission denied"))).toBe("Permission denied")
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
      availableSkills: [],
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
      availableSkills: [],
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

describe("hasRenderableTranscriptHistory", () => {
  test("returns false for metadata-only transcript slices", () => {
    const messages: HydratedTranscriptMessage[] = [
      {
        kind: "system_init",
        id: "system-1",
        timestamp: new Date(1).toISOString(),
        provider: "codex",
        model: "gpt-5",
        tools: [],
        agents: [],
        slashCommands: [],
        mcpServers: [],
        hidden: false,
      },
      {
        kind: "status",
        id: "status-1",
        timestamp: new Date(2).toISOString(),
        status: "running",
        hidden: false,
      },
    ]

    expect(hasRenderableTranscriptHistory(messages)).toBe(false)
  })

  test("returns true when transcript slice includes conversation content", () => {
    const messages: HydratedTranscriptMessage[] = [
      {
        kind: "status",
        id: "status-1",
        timestamp: new Date(1).toISOString(),
        status: "running",
        hidden: false,
      },
      {
        kind: "assistant_text",
        id: "assistant-1",
        timestamp: new Date(2).toISOString(),
        text: "Still here",
        hidden: false,
      },
    ]

    expect(hasRenderableTranscriptHistory(messages)).toBe(true)
  })
})

describe("summarizeTranscriptWindow", () => {
  test("splits renderable, hidden, status, and metadata-only messages", () => {
    const messages: HydratedTranscriptMessage[] = [
      {
        kind: "system_init",
        id: "system-1",
        timestamp: new Date(1).toISOString(),
        provider: "codex",
        model: "gpt-5",
        tools: [],
        agents: [],
        slashCommands: [],
        mcpServers: [],
        hidden: false,
      },
      {
        kind: "status",
        id: "status-1",
        timestamp: new Date(2).toISOString(),
        status: "running",
        hidden: false,
      },
      {
        kind: "assistant_text",
        id: "assistant-1",
        timestamp: new Date(3).toISOString(),
        text: "Visible",
        hidden: false,
      },
      {
        kind: "assistant_text",
        id: "assistant-hidden-1",
        timestamp: new Date(4).toISOString(),
        text: "Hidden",
        hidden: true,
      },
    ]

    expect(summarizeTranscriptWindow(messages)).toEqual({
      totalCount: 4,
      renderableCount: 1,
      hiddenCount: 1,
      statusCount: 1,
      metadataOnlyCount: 2,
    })
  })
})

describe("shouldBackfillTranscriptWindow", () => {
  test("backs up when tail slice has no renderable history and older entries exist", () => {
    const messages: HydratedTranscriptMessage[] = [
      {
        kind: "status",
        id: "status-1",
        timestamp: new Date(1).toISOString(),
        status: "running",
        hidden: false,
      },
    ]

    expect(shouldBackfillTranscriptWindow({
      messages,
      messageCount: 450,
      offset: 250,
    })).toBe(true)
  })

  test("does not backfill when already at the start of the transcript", () => {
    expect(shouldBackfillTranscriptWindow({
      messages: [],
      messageCount: 50,
      offset: 0,
    })).toBe(false)
  })

  test("does not backfill when the current window already has transcript content", () => {
    const messages: HydratedTranscriptMessage[] = [
      {
        kind: "assistant_text",
        id: "assistant-1",
        timestamp: new Date(1).toISOString(),
        text: "Visible",
        hidden: false,
      },
    ]

    expect(shouldBackfillTranscriptWindow({
      messages,
      messageCount: 450,
      offset: 250,
    })).toBe(false)
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
    expect(getInitialChatReadAnchor({
      activeChatId: "chat-1",
      sidebarReady: true,
      hasSidebarChat: true,
      messages: [assistantMessage("assistant-1")],
      lastSeenMessageAt: persistedReadAt ?? undefined,
      lastMessageAt: 11,
    })).toEqual({ kind: "tail" })
  })

  test("does nothing when the chat has no latest message timestamp yet", () => {
    expect(getReadTimestampToPersistAfterReply(10, undefined)).toBeNull()
  })
})

describe("read-boundary helpers", () => {
  test("ignores metadata-only transcript messages when choosing a readable boundary", () => {
    expect(isReadableTranscriptMessage({
      id: "status-1",
      kind: "status",
      status: "running",
      timestamp: "2026-04-01T00:00:00.000Z",
    })).toBe(false)
    expect(isReadableTranscriptMessage(assistantMessage("assistant-1"))).toBe(true)
  })

  test("returns the latest readable transcript message", () => {
    expect(getLastReadableMessage([
      {
        id: "status-1",
        kind: "status",
        status: "running",
        timestamp: "2026-04-01T00:00:00.000Z",
      },
      assistantMessage("assistant-1"),
      {
        id: "status-2",
        kind: "status",
        status: "done",
        timestamp: "2026-04-01T00:00:01.000Z",
      },
    ])?.id).toBe("assistant-1")
  })

  test("counts assistant text paragraphs and list items as readable blocks", () => {
    expect(getReadableBlockCount(paragraphMessage("assistant-1", "One\n\nTwo\n\nThree"))).toBe(3)
    expect(getReadableBlockCount(paragraphMessage("assistant-2", "- A\n- B\n- C"))).toBe(3)
  })

  test("finds the next unread block inside the same long message after the exact last-read block", () => {
    expect(getNextReadableBoundary({
      messages: [
        paragraphMessage("assistant-1", "One\n\nTwo\n\nThree"),
      ],
      lastReadMessageId: "assistant-1",
      lastReadBlockIndex: 0,
      lastSeenMessageAt: 1,
      lastMessageAt: 2,
    })).toEqual({ messageId: "assistant-1", blockIndex: 1 })
  })

  test("moves to the next message when the last-read block was already the final block of the message", () => {
    expect(getNextReadableBoundary({
      messages: [
        paragraphMessage("assistant-1", "One\n\nTwo"),
        assistantMessage("assistant-2"),
      ],
      lastReadMessageId: "assistant-1",
      lastReadBlockIndex: 1,
      lastSeenMessageAt: 1,
      lastMessageAt: 3,
    })).toEqual({ messageId: "assistant-2", blockIndex: 0 })
  })

  test("falls back to the earliest loaded readable message when only legacy timestamp state says the chat is unread", () => {
    expect(getNextReadableBoundary({
      messages: [
        assistantMessage("assistant-1"),
        assistantMessage("assistant-2"),
      ],
      lastSeenMessageAt: 1,
      lastMessageAt: 2,
    })).toEqual({ messageId: "assistant-1", blockIndex: 0 })
  })

  test("returns null when the latest readable block is already the exact read boundary", () => {
    expect(getNextReadableBoundary({
      messages: [
        paragraphMessage("assistant-1", "One\n\nTwo"),
      ],
      lastReadMessageId: "assistant-1",
      lastReadBlockIndex: 1,
      lastSeenMessageAt: 2,
      lastMessageAt: 2,
    })).toBeNull()
  })
})

describe("getInitialChatReadAnchor", () => {
  test("waits for the sidebar row before deciding whether the chat is read", () => {
    expect(getInitialChatReadAnchor({
      activeChatId: "chat-1",
      sidebarReady: false,
      hasSidebarChat: false,
      messages: [assistantMessage("assistant-1")],
      lastSeenMessageAt: 1,
      lastMessageAt: 2,
    })).toEqual({ kind: "wait" })
  })

  test("anchors unread chats to the first unread message once the sidebar row is known", () => {
    expect(getInitialChatReadAnchor({
      activeChatId: "chat-1",
      sidebarReady: true,
      hasSidebarChat: true,
      messages: [
        paragraphMessage("assistant-1", "One\n\nTwo\n\nThree"),
        assistantMessage("assistant-2"),
      ],
      lastReadMessageId: "assistant-1",
      lastReadBlockIndex: 0,
      lastSeenMessageAt: 1,
      lastMessageAt: 3,
    })).toEqual({ kind: "block", messageId: "assistant-1", blockIndex: 1 })
  })

  test("opens fully read chats at the tail", () => {
    expect(getInitialChatReadAnchor({
      activeChatId: "chat-1",
      sidebarReady: true,
      hasSidebarChat: true,
      messages: [
        assistantMessage("assistant-1"),
        assistantMessage("assistant-2"),
      ],
      lastReadMessageId: "assistant-2",
      lastSeenMessageAt: 2,
      lastMessageAt: 2,
    })).toEqual({ kind: "tail" })
  })

  test("treats the home route as already resolved", () => {
    expect(getInitialChatReadAnchor({
      activeChatId: null,
      sidebarReady: false,
      hasSidebarChat: false,
      messages: [],
    })).toEqual({ kind: "tail" })
  })
})

describe("getLockedInitialChatReadAnchor", () => {
  test("locks the first resolved unread anchor for the active chat", () => {
    expect(getLockedInitialChatReadAnchor(
      { kind: "wait" },
      { kind: "block", messageId: "assistant-1", blockIndex: 1 },
      false,
    )).toEqual({ kind: "block", messageId: "assistant-1", blockIndex: 1 })

    expect(getLockedInitialChatReadAnchor(
      { kind: "block", messageId: "assistant-1", blockIndex: 1 },
      { kind: "block", messageId: "assistant-2", blockIndex: 0 },
      false,
    )).toEqual({ kind: "block", messageId: "assistant-1", blockIndex: 1 })
  })

  test("ignores follow-up anchor changes after the initial scroll completed", () => {
    expect(getLockedInitialChatReadAnchor(
      { kind: "block", messageId: "assistant-1", blockIndex: 1 },
      { kind: "tail" },
      true,
    )).toEqual({ kind: "block", messageId: "assistant-1", blockIndex: 1 })
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

function createMockCachedState(messageCount = 5): {
  hydrator: ReturnType<typeof createIncrementalHydrator>
  messages: HydratedTranscriptMessage[]
  messageCount: number
  cachedAt: number
  lastMessageAt: number | undefined
  stale: boolean
} {
  return {
    hydrator: createIncrementalHydrator(),
    messages: [] as HydratedTranscriptMessage[],
    messageCount,
    cachedAt: Date.now(),
    lastMessageAt: Date.now(),
    stale: false,
  }
}

describe("chatCache", () => {
  afterEach(() => {
    clearChatCache()
  })

  test("getCachedChat returns null for unknown chat IDs", () => {
    expect(getCachedChat("unknown-id")).toBeNull()
  })

  test("setCachedChat stores and getCachedChat retrieves", () => {
    const state = createMockCachedState()
    setCachedChat("chat-1", state)

    const retrieved = getCachedChat("chat-1")
    expect(retrieved).not.toBeNull()
    expect(retrieved?.messageCount).toBe(5)
  })

  test("setCachedChat overwrites existing entry", () => {
    setCachedChat("chat-1", createMockCachedState(5))
    setCachedChat("chat-1", createMockCachedState(10))

    const retrieved = getCachedChat("chat-1")
    expect(retrieved?.messageCount).toBe(10)
  })

  test("LRU eviction when exceeding MAX_CACHED_CHATS", () => {
    for (let i = 0; i < MAX_CACHED_CHATS; i++) {
      setCachedChat(`chat-${i}`, createMockCachedState(i))
    }

    // All should be present
    for (let i = 0; i < MAX_CACHED_CHATS; i++) {
      expect(getCachedChat(`chat-${i}`)).not.toBeNull()
    }

    // Adding one more should evict the first
    setCachedChat("chat-overflow", createMockCachedState(99))
    expect(getCachedChat("chat-0")).toBeNull()
    expect(getCachedChat("chat-overflow")).not.toBeNull()
    expect(getCachedChat("chat-overflow")?.messageCount).toBe(99)
  })

  test("deleteCachedChat removes specific entry", () => {
    setCachedChat("chat-1", createMockCachedState())
    setCachedChat("chat-2", createMockCachedState())

    deleteCachedChat("chat-1")
    expect(getCachedChat("chat-1")).toBeNull()
    expect(getCachedChat("chat-2")).not.toBeNull()
  })

  test("deleteCachedChat is no-op for missing chat", () => {
    deleteCachedChat("nonexistent")
    // No error thrown
  })

  test("clearChatCache empties entire cache", () => {
    setCachedChat("chat-1", createMockCachedState())
    setCachedChat("chat-2", createMockCachedState())

    clearChatCache()
    expect(getCachedChat("chat-1")).toBeNull()
    expect(getCachedChat("chat-2")).toBeNull()
  })

  test("markCachedChatsStale marks entry stale when sidebar has newer lastMessageAt", () => {
    const now = Date.now()
    const state = createMockCachedState()
    state.lastMessageAt = now - 5000
    setCachedChat("chat-1", state)

    markCachedChatsStale([
      { chatId: "chat-1", lastMessageAt: now },
    ])

    expect(getCachedChat("chat-1")?.stale).toBe(true)
  })

  test("markCachedChatsStale does not mark entry stale when sidebar lastMessageAt is older", () => {
    const now = Date.now()
    const state = createMockCachedState()
    state.lastMessageAt = now
    setCachedChat("chat-1", state)

    markCachedChatsStale([
      { chatId: "chat-1", lastMessageAt: now - 5000 },
    ])

    expect(getCachedChat("chat-1")?.stale).toBe(false)
  })

  test("markCachedChatsStale skips chats not in sidebar", () => {
    setCachedChat("chat-1", createMockCachedState())

    markCachedChatsStale([
      { chatId: "chat-other", lastMessageAt: Date.now() + 10000 },
    ])

    expect(getCachedChat("chat-1")?.stale).toBe(false)
  })

  test("markCachedChatsStale skips already-stale entries", () => {
    const state = createMockCachedState()
    state.lastMessageAt = 100
    state.stale = true
    setCachedChat("chat-1", state)

    // Even with a newer sidebar timestamp, already-stale entries are skipped
    markCachedChatsStale([
      { chatId: "chat-1", lastMessageAt: 200 },
    ])

    // Still stale (no unnecessary re-save)
    expect(getCachedChat("chat-1")?.stale).toBe(true)
  })
})
