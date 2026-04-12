import { describe, expect, test } from "bun:test"
import {
  clearPendingSessionBootstrapAfterAttempt,
  enrichCommandError,
  fetchTranscriptRange,
  MIN_TRANSCRIPT_FETCH_CHUNK_SIZE,
  removeChatFromSidebar,
  shouldTriggerSnapshotRecovery,
  transitionPendingSessionBootstrapToError,
  type EnrichedError,
  type PendingSessionBootstrap,
} from "./appState.helpers"
import type { SidebarData, SidebarChatRow } from "../../shared/types"
import type { AppTransport } from "./socket-interface"

function createTransportWithCommand(command: AppTransport["command"]): AppTransport {
  return {
    start() {},
    dispose() {},
    onStatus() { return () => {} },
    subscribe() { return () => {} },
    subscribeTerminal() { return () => {} },
    command,
    ensureHealthyConnection: async () => {},
  }
}

function createMockGetMessagesCommand(
  handler: (command: Extract<Parameters<AppTransport["command"]>[0], { type: "chat.getMessages" }>) => Promise<unknown>
): AppTransport["command"] {
  return async <TResult = unknown>(command: Parameters<AppTransport["command"]>[0]) => {
    if (command.type !== "chat.getMessages") {
      throw new Error(`Unexpected command ${command.type}`)
    }
    return await handler(command) as TResult
  }
}

function pendingBootstrap(kind: PendingSessionBootstrap["kind"], phase: PendingSessionBootstrap["phase"]): PendingSessionBootstrap {
  return {
    chatId: "chat-target",
    kind,
    phase,
    sourceLabels: kind === "fork" ? ["Source"] : ["Source A", "Source B"],
    previewTitle: kind === "fork" ? "Fork: Source" : "Merge: Source A + Source B",
    previewIntent: kind === "fork" ? "Investigate the timeout." : "Combine the verified findings.",
  }
}

describe("transitionPendingSessionBootstrapToError", () => {
  test("marks fork bootstrap failures as sticky errors for the active chat", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("fork", "starting"),
      "chat-target",
      "Fork failed upstream",
    )).toEqual({
      chatId: "chat-target",
      kind: "fork",
      phase: "error",
      sourceLabels: ["Source"],
      previewTitle: "Fork: Source",
      previewIntent: "Investigate the timeout.",
      errorMessage: "Fork failed upstream",
    })
  })

  test("marks merge bootstrap failures as sticky errors for the active chat", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("merge", "starting"),
      "chat-target",
      "Merge failed upstream",
    )).toEqual({
      chatId: "chat-target",
      kind: "merge",
      phase: "error",
      sourceLabels: ["Source A", "Source B"],
      previewTitle: "Merge: Source A + Source B",
      previewIntent: "Combine the verified findings.",
      errorMessage: "Merge failed upstream",
    })
  })

  test("ignores failures from other chats", () => {
    expect(transitionPendingSessionBootstrapToError(
      pendingBootstrap("merge", "starting"),
      "chat-other",
      "should be ignored",
    )).toEqual(pendingBootstrap("merge", "starting"))
  })
})

describe("clearPendingSessionBootstrapAfterAttempt", () => {
  test("clears successful fork bootstrap placeholders", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      pendingBootstrap("fork", "starting"),
      "chat-target",
    )).toBeNull()
  })

  test("keeps failed merge bootstrap errors visible until dismissal", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      {
        ...pendingBootstrap("merge", "error"),
        errorMessage: "Merge failed upstream",
      },
      "chat-target",
    )).toEqual({
      chatId: "chat-target",
      kind: "merge",
      phase: "error",
      sourceLabels: ["Source A", "Source B"],
      previewTitle: "Merge: Source A + Source B",
      previewIntent: "Combine the verified findings.",
      errorMessage: "Merge failed upstream",
    })
  })

  test("ignores cleanup for other chats", () => {
    expect(clearPendingSessionBootstrapAfterAttempt(
      pendingBootstrap("fork", "compacting"),
      "chat-other",
    )).toEqual(pendingBootstrap("fork", "compacting"))
  })
})

function chatRow(chatId: string, title = `Chat ${chatId}`): SidebarChatRow {
  return {
    _id: chatId,
    _creationTime: 1,
    chatId,
    title,
    status: "idle",
    unread: false,
    localPath: "/tmp/project",
    provider: "claude",
    hasAutomation: false,
  }
}

function sidebarWith(...groups: Array<{ key: string; chats: SidebarChatRow[] }>): SidebarData {
  return {
    workspaceGroups: groups.map((g) => ({
      groupKey: g.key,
      localPath: `/tmp/${g.key}`,
      chats: g.chats,
    })),
  }
}

describe("removeChatFromSidebar", () => {
  test("removes the target chat from its project group", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("a"), chatRow("b"), chatRow("c")] })
    const result = removeChatFromSidebar(data, "b")
    expect(result.workspaceGroups[0].chats.map((c) => c.chatId)).toEqual(["a", "c"])
  })

  test("removes empty project groups after the last chat is deleted", () => {
    const data = sidebarWith(
      { key: "p1", chats: [chatRow("only")] },
      { key: "p2", chats: [chatRow("other")] },
    )
    const result = removeChatFromSidebar(data, "only")
    expect(result.workspaceGroups).toHaveLength(1)
    expect(result.workspaceGroups[0].groupKey).toBe("p2")
  })

  test("returns identical data when chatId is not found", () => {
    const data = sidebarWith({ key: "p1", chats: [chatRow("a")] })
    const result = removeChatFromSidebar(data, "nonexistent")
    expect(result).toEqual(data)
  })

  test("handles multiple project groups, only removing from the correct one", () => {
    const data = sidebarWith(
      { key: "p1", chats: [chatRow("a"), chatRow("b")] },
      { key: "p2", chats: [chatRow("c"), chatRow("d")] },
    )
    const result = removeChatFromSidebar(data, "c")
    expect(result.workspaceGroups[0].chats.map((c) => c.chatId)).toEqual(["a", "b"])
    expect(result.workspaceGroups[1].chats.map((c) => c.chatId)).toEqual(["d"])
  })
})

describe("shouldTriggerSnapshotRecovery", () => {
  test("triggers recovery when snapshot never arrived and fetch never started", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: false,
      initialFetchDone: false,
      fetchTriggered: false,
    })).toBe(true)
  })

  test("does not trigger if cancelled", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: true,
      initialFetchDone: false,
      fetchTriggered: false,
    })).toBe(false)
  })

  test("does not trigger if initial fetch already completed", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: false,
      initialFetchDone: true,
      fetchTriggered: false,
    })).toBe(false)
  })

  test("does not trigger if fetch was already triggered", () => {
    expect(shouldTriggerSnapshotRecovery({
      cancelled: false,
      initialFetchDone: false,
      fetchTriggered: true,
    })).toBe(false)
  })
})

describe("enrichCommandError", () => {
  test("enriches 'not connected' with server hint and dismiss action", () => {
    const result = enrichCommandError("not connected")
    expect(result.message).toBe("Can't reach the server")
    expect(result.hint).toBe("Make sure Tinkaria is running on this machine.")
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })

  test("enriches connection closed with reconnecting hint", () => {
    const result = enrichCommandError("WebSocket connection closed unexpectedly")
    expect(result.message).toBe("Connection dropped")
    expect(result.hint).toBe("Reconnecting automatically...")
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })

  test("enriches socket closed with reconnecting hint", () => {
    const result = enrichCommandError("socket closed")
    expect(result.message).toBe("Connection dropped")
  })

  test("enriches version mismatch with restart hint", () => {
    const result = enrichCommandError("Unknown command type: system.readLocalFilePreview")
    expect(result.message).toBe("Client is newer than server")
    expect(result.hint).toBe("Restart Tinkaria to enable in-app file previews.")
  })

  test("passes through unknown errors with no hint", () => {
    const result = enrichCommandError("Something weird happened")
    expect(result.message).toBe("Something weird happened")
    expect(result.hint).toBeUndefined()
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })
})

describe("fetchTranscriptRange", () => {
  test("returns the requested range in one request when payload fits", async () => {
    const commandCalls: Array<{ offset?: number; limit?: number }> = []
    const socket = createTransportWithCommand(createMockGetMessagesCommand(async (command) => {
        commandCalls.push({ offset: command.offset, limit: command.limit })
        return [{ kind: "assistant_text", createdAt: 1, messageId: "m1", text: "ok" }]
      }))

    const result = await fetchTranscriptRange({
      socket,
      chatId: "chat-1",
      offset: 5,
      limit: 1,
    })

    expect(result).toHaveLength(1)
    expect(commandCalls).toEqual([{ offset: 5, limit: 1 }])
  })

  test("halves chunk size and retries when a range exceeds payload limits", async () => {
    const commandCalls: Array<{ offset?: number; limit?: number }> = []
    const socket = createTransportWithCommand(createMockGetMessagesCommand(async (command) => {
        commandCalls.push({ offset: command.offset, limit: command.limit })
        if ((command.limit ?? 0) > 2) {
          throw new Error("'payload' max_payload size exceeded")
        }
        return Array.from({ length: command.limit ?? 0 }, (_, index) => ({
          kind: "assistant_text" as const,
          createdAt: (command.offset ?? 0) + index,
          messageId: `m-${(command.offset ?? 0) + index}`,
          text: `chunk-${(command.offset ?? 0) + index}`,
        }))
      }))

    const result = await fetchTranscriptRange({
      socket,
      chatId: "chat-1",
      offset: 0,
      limit: 5,
    })

    expect(result).toHaveLength(5)
    expect(commandCalls).toEqual([
      { offset: 0, limit: 5 },
      { offset: 0, limit: 2 },
      { offset: 2, limit: 2 },
      { offset: 4, limit: 1 },
    ])
  })

  test("rethrows payload errors once the request is already at the minimum chunk size", async () => {
    const socket = createTransportWithCommand(createMockGetMessagesCommand(async () => {
      throw new Error("'payload' max_payload size exceeded")
    }))

    await expect(fetchTranscriptRange({
      socket,
      chatId: "chat-1",
      offset: 0,
      limit: MIN_TRANSCRIPT_FETCH_CHUNK_SIZE,
    })).rejects.toThrow(/max_payload/i)
  })
})
