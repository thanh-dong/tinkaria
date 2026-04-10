import { describe, expect, test } from "bun:test"
import type { SidebarChatRow } from "../../../../shared/types"
import { areChatRowPropsEqual } from "./ChatRow"

function createChat(overrides: Partial<SidebarChatRow> = {}): SidebarChatRow {
  return {
    _id: "chat-1",
    _creationTime: 1,
    chatId: "chat-1",
    title: "Demo chat",
    status: "idle",
    unread: false,
    localPath: "/tmp/demo",
    provider: "codex",
    model: "gpt-5.4",
    lastMessageAt: 10,
    hasAutomation: false,
    ...overrides,
  }
}

describe("ChatRow", () => {
  test("ignores callback identity churn when row-visible state is unchanged", () => {
    expect(areChatRowPropsEqual({
      chat: createChat(),
      activeChatId: "chat-2",
      nowMs: 100,
      onSelectChat: () => {},
      onDeleteChat: () => {},
      onRenameChat: () => {},
    }, {
      chat: createChat(),
      activeChatId: "chat-2",
      nowMs: 100,
      onSelectChat: () => {},
      onDeleteChat: () => {},
      onRenameChat: () => {},
    })).toBe(true)
  })

  test("treats active-state changes as visible row changes", () => {
    expect(areChatRowPropsEqual({
      chat: createChat(),
      activeChatId: "chat-1",
      nowMs: 100,
      onSelectChat: () => {},
      onDeleteChat: () => {},
      onRenameChat: () => {},
    }, {
      chat: createChat(),
      activeChatId: "chat-2",
      nowMs: 100,
      onSelectChat: () => {},
      onDeleteChat: () => {},
      onRenameChat: () => {},
    })).toBe(false)
  })
})
