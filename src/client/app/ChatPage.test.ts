import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { HydratedTranscriptMessage } from "../../shared/types"
import { ChatNavbar } from "../components/chat-ui/ChatNavbar"
import { TextMessage } from "../components/messages/TextMessage"
import type { ProcessedTextMessage } from "../components/messages/types"
import { createUiIdentity, getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import {
  ChatEmptyStateBrandMark,
  getAvailableSkillsFromMessages,
  getChatPageUiIdentities,
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

function createAssistantTextMessage(text: string): ProcessedTextMessage {
  return {
    kind: "assistant_text",
    id: "assistant-1",
    timestamp: "2026-04-02T00:00:00.000Z",
    text,
  }
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
  test("opens the mobile sidebar for a right swipe from the left third", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 12,
      startY: 120,
      currentX: 112,
      currentY: 138,
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: false,
      target: plainTarget(),
    })).toBe(true)
  })

  test("rejects swipes that start past the left third of the viewport", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 200,
      startY: 120,
      currentX: 300,
      currentY: 132,
      viewportWidth: 375,
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
      viewportWidth: 375,
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
      viewportWidth: 375,
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
      viewportWidth: 375,
      isMobileViewport: true,
      isSidebarOpen: true,
      target,
    })).toBe(false)

    expect(shouldOpenMobileSidebarFromSwipe({
      startX: 10,
      startY: 120,
      currentX: 120,
      currentY: 130,
      viewportWidth: 375,
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

describe("getChatPageUiIdentities", () => {
  test("renders the branded empty-state mark instead of the old flower icon", () => {
    const html = renderToStaticMarkup(createElement(ChatEmptyStateBrandMark))

    expect(html).toContain("tinkaria-mark-fine.svg")
    expect(html).not.toContain("lucide-flower")
    expect(html).toContain("tinkaria-empty-state-flower")
  })

  test("returns the stable first-release chat shell identities", () => {
    expect(getChatPageUiIdentities()).toEqual({
      page: "chat.page",
      transcript: "transcript.message-list",
      composer: "chat.composer",
      navbar: "chat.navbar",
    })
  })

  test("maps each shell identity through the shared ui-id helper", () => {
    const identities = getChatPageUiIdentities()

    expect(getUiIdentityAttributeProps(identities.page)).toEqual({
      "data-ui-id": "chat.page",
    })
    expect(getUiIdentityAttributeProps(identities.transcript)).toEqual({
      "data-ui-id": "transcript.message-list",
    })
    expect(getUiIdentityAttributeProps(identities.composer)).toEqual({
      "data-ui-id": "chat.composer",
    })
    expect(getUiIdentityAttributeProps(identities.navbar)).toEqual({
      "data-ui-id": "chat.navbar",
    })
  })

  test("renders the assistant response id outside the long-message response chrome", () => {
    const html = renderToStaticMarkup(
      createElement(TextMessage, {
        message: createAssistantTextMessage("x".repeat(801)),
      })
    )

    const identityIndex = html.indexOf('data-ui-id="message.assistant.response"')
    const responseTitleIndex = html.indexOf(">Response<")

    expect(identityIndex).toBeGreaterThan(-1)
    expect(responseTitleIndex).toBeGreaterThan(-1)
    expect(identityIndex).toBeLessThan(responseTitleIndex)
  })

  test("renders the navbar id on the ChatNavbar visible surface", () => {
    const html = renderToStaticMarkup(
      createElement(ChatNavbar, {
        sidebarCollapsed: false,
        onOpenSidebar: () => {},
        onCollapseSidebar: () => {},
        onExpandSidebar: () => {},
        onForkSession: () => {},
      })
    )

    const identityIndex = html.indexOf('data-ui-id="chat.navbar"')
    const forkButtonIndex = html.indexOf('title="Fork session"')

    expect(identityIndex).toBeGreaterThan(-1)
    expect(forkButtonIndex).toBeGreaterThan(-1)
    expect(identityIndex).toBeLessThan(forkButtonIndex)
  })

  test("renders curated navbar area and action ids on the stable visible controls", () => {
    const navbarAreaId = createUiIdentity("chat.navbar", "area")
    const forkSessionActionId = createUiIdentity("chat.navbar.fork-session", "action")
    const html = renderToStaticMarkup(
      createElement(ChatNavbar, {
        sidebarCollapsed: false,
        onOpenSidebar: () => {},
        onCollapseSidebar: () => {},
        onExpandSidebar: () => {},
        onForkSession: () => {},
        localPath: "/tmp/project",
      })
    )

    expect(html).toMatch(new RegExp(`<div[^>]*data-ui-id="${navbarAreaId}"`))
    expect(html).toMatch(new RegExp(`<button[^>]*data-ui-id="${forkSessionActionId}"`))
  })
})
