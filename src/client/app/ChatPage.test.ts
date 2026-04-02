import { describe, expect, test } from "bun:test"
import type { HydratedTranscriptMessage } from "../../shared/types"
import {
  getAvailableSkillsFromMessages,
  getEmptyStateTypingDurationMs,
  shouldIgnoreMobileSidebarSwipeStart,
  shouldOpenMobileSidebarFromSwipe,
} from "./ChatPage"

function systemInitMessage(args: {
  slashCommands: string[]
  debugRaw?: string
}): HydratedTranscriptMessage {
  return {
    id: "system-init-1",
    timestamp: "2026-04-01T00:00:00.000Z",
    kind: "system_init",
    provider: "claude",
    model: "claude-opus-4-1",
    tools: [],
    agents: [],
    slashCommands: args.slashCommands,
    mcpServers: [],
    debugRaw: args.debugRaw,
  } as HydratedTranscriptMessage
}

function interactiveTarget(): EventTarget {
  return {
    closest: () => ({ tagName: "BUTTON" }),
  } as unknown as EventTarget
}

function plainTarget(): EventTarget {
  return {
    closest: () => null,
  } as unknown as EventTarget
}

describe("getAvailableSkillsFromMessages", () => {
  test("prefers the narrower skills list from system init debug payload", () => {
    const messages = [
      systemInitMessage({
        slashCommands: ["debug", "review-pr", "release"],
        debugRaw: JSON.stringify({
          slash_commands: ["debug", "review-pr", "release"],
          skills: ["debug", "frontend-design:frontend-design"],
        }),
      }),
    ]

    expect(getAvailableSkillsFromMessages(messages)).toEqual([
      "debug",
      "frontend-design:frontend-design",
    ])
  })

  test("falls back to slashCommands when debug payload has no skills", () => {
    const messages = [
      systemInitMessage({
        slashCommands: ["debug", "review-pr"],
      }),
    ]

    expect(getAvailableSkillsFromMessages(messages)).toEqual(["debug", "review-pr"])
  })

  test("returns an empty list when neither skills nor slashCommands exist", () => {
    const messages = [
      systemInitMessage({
        slashCommands: [],
      }),
    ]

    expect(getAvailableSkillsFromMessages(messages)).toEqual([])
  })
})

describe("shouldIgnoreMobileSidebarSwipeStart", () => {
  test("ignores gestures that start from interactive controls", () => {
    expect(shouldIgnoreMobileSidebarSwipeStart(interactiveTarget())).toBe(true)
  })

  test("allows gestures that start from non-interactive containers", () => {
    expect(shouldIgnoreMobileSidebarSwipeStart(plainTarget())).toBe(false)
  })
})

describe("shouldOpenMobileSidebarFromSwipe", () => {
  test("opens the mobile sidebar for a right swipe from the left edge", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 12,
      startY: 120,
      currentX: 112,
      currentY: 138,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(true)
  })

  test("rejects swipes that start away from the left edge", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 80,
      startY: 120,
      currentX: 180,
      currentY: 132,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(false)
  })

  test("rejects mostly vertical drags", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 16,
      startY: 120,
      currentX: 72,
      currentY: 240,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(false)
  })

  test("rejects gestures that start from interactive controls", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: interactiveTarget(),
    })).toBe(false)
  })

  test("rejects gestures when the sidebar is already open or desktop layout is active", () => {
    const target = plainTarget()

    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      isMobileViewport: true,
      isSidebarOpen: true,
      target,
    })).toBe(false)

    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      isMobileViewport: false,
      isSidebarOpen: false,
      target,
    })).toBe(false)
  })
})

describe("getEmptyStateTypingDurationMs", () => {
  test("scales linearly with the configured per-character interval", () => {
    expect(getEmptyStateTypingDurationMs("")).toBe(0)
    expect(getEmptyStateTypingDurationMs("abc")).toBe(57)
    expect(getEmptyStateTypingDurationMs("What are we building?")).toBe(399)
  })
})
