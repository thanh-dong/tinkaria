import { afterEach, describe, expect, test } from "bun:test"
import { sanitizeQueuedDrafts, useChatInputStore } from "./chatInputStore"

const INITIAL_STATE = useChatInputStore.getInitialState()

afterEach(() => {
  useChatInputStore.setState(INITIAL_STATE, true)
})

describe("sanitizeQueuedDrafts", () => {
  test("drops expired and blank queued drafts while keeping recent valid entries", () => {
    const now = Date.UTC(2026, 3, 3)
    const sanitized = sanitizeQueuedDrafts({
      "chat-valid": {
        text: "Queued follow-up",
        updatedAt: now,
      },
      "chat-expired": {
        text: "Too old",
        updatedAt: now - (8 * 24 * 60 * 60 * 1000),
      },
      "chat-blank": {
        text: "   ",
        updatedAt: now,
      },
    }, now)

    expect(sanitized).toEqual({
      "chat-valid": {
        text: "Queued follow-up",
        updatedAt: now,
      },
    })
  })

  test("trims oversized queued drafts to the configured maximum length", () => {
    const now = Date.UTC(2026, 3, 3)
    const oversized = "x".repeat(30_000)
    const sanitized = sanitizeQueuedDrafts({
      "chat-1": {
        text: oversized,
        updatedAt: now,
      },
    }, now)

    expect(sanitized["chat-1"]?.text.length).toBe(20_000)
    expect(sanitized["chat-1"]?.text).toBe(oversized.slice(-20_000))
  })
})

describe("chatInputStore queued drafts", () => {
  test("stores, restores, and clears queued drafts per chat", () => {
    const now = Date.now()
    useChatInputStore.getState().setQueuedDraft("chat-1", {
      text: "Queued follow-up",
      updatedAt: now,
    })

    expect(useChatInputStore.getState().getQueuedDraft("chat-1")).toEqual({
      text: "Queued follow-up",
      updatedAt: now,
    })

    useChatInputStore.getState().clearQueuedDraft("chat-1")
    expect(useChatInputStore.getState().getQueuedDraft("chat-1")).toBeNull()
  })
})
