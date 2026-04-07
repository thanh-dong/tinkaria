import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  SessionPickerContent,
  getSessionPickerUiIdentityDescriptors,
  getVisibleSessions,
} from "./SessionPicker"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import type { DiscoveredSession } from "../../../shared/types"

const mockSessions: DiscoveredSession[] = [
  {
    sessionId: "sess-1",
    provider: "claude",
    source: "tinkaria",
    title: "Fix auth bug",
    lastExchange: { question: "Fix the auth bug", answer: "Done" },
    modifiedAt: Date.now() - 3600_000,
    chatId: "chat-1",
  },
  {
    sessionId: "sess-2",
    provider: "codex",
    source: "cli",
    title: "",
    lastExchange: { question: "Add unit tests for login", answer: "Here are the tests" },
    modifiedAt: Date.now() - 7200_000,
    chatId: null,
    runtime: {
      model: "gpt-5.4",
      tokenUsage: {
        totalTokens: 4312,
        contextWindow: 272000,
        estimatedContextPercent: 16,
      },
      usageBuckets: [
        { label: "5h", usedPercent: 13 },
        { label: "7d", usedPercent: 7 },
      ],
    },
  },
]

describe("SessionPickerContent", () => {
  test("backs session picker grab targets with C3-owned descriptors", () => {
    const descriptors = getSessionPickerUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.searchInput)).toEqual({
      "data-ui-id": "sidebar.project-group.sessions.search.input",
      "data-ui-c3": "c3-113",
      "data-ui-c3-label": "sidebar",
    })
    expect(getUiIdentityAttributeProps(descriptors.list)).toEqual({
      "data-ui-id": "sidebar.project-group.sessions.list",
      "data-ui-c3": "c3-113",
      "data-ui-c3-label": "sidebar",
    })
  })

  test("renders session list with titles", () => {
    const html = renderToStaticMarkup(
      <SessionPickerContent
        sessions={mockSessions}
        windowDays={7}
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        isRefreshing={false}
      />
    )

    expect(html).toContain('data-ui-id="sidebar.project-group.sessions.search.input"')
    expect(html).toContain('data-ui-id="sidebar.project-group.sessions.list"')
    expect(html).toContain('data-ui-c3="c3-113"')
    expect(html).toContain('data-ui-c3-label="sidebar"')
    expect(html).toContain("Fix auth bug")
    expect(html).toContain("Add unit tests for login")
  })

  test("renders runtime session details when available", () => {
    const html = renderToStaticMarkup(
      <SessionPickerContent
        sessions={mockSessions}
        windowDays={7}
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        isRefreshing={false}
      />
    )

    expect(html).toContain("gpt-5.4")
    expect(html).toContain("~16% ctx")
    expect(html).toContain("4.3K used")
    expect(html).toContain("5h 13%")
    expect(html).toContain("7d 7%")
  })

  test("renders empty state when no sessions", () => {
    const html = renderToStaticMarkup(
      <SessionPickerContent
        sessions={[]}
        windowDays={7}
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        isRefreshing={false}
      />
    )

    expect(html).toContain("No sessions")
  })

  test("searches across older sessions outside the default window", () => {
    const oldSession: DiscoveredSession = {
      sessionId: "sess-old",
      provider: "claude",
      source: "cli",
      title: "",
      lastExchange: { question: "Recover the archived release session", answer: "Loaded" },
      modifiedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      chatId: null,
    }

    const html = renderToStaticMarkup(
      <SessionPickerContent
        sessions={[...mockSessions, oldSession]}
        windowDays={7}
        searchQuery="archived release"
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        isRefreshing={false}
      />
    )

    expect(html).toContain("Recover the archived release session")
  })
})

describe("getVisibleSessions", () => {
  test("keeps the default view windowed but searches across the full session list", () => {
    const now = Date.now()
    const recentSession: DiscoveredSession = {
      sessionId: "sess-recent",
      provider: "claude",
      source: "tinkaria",
      title: "Recent session",
      lastExchange: { question: "Recent session", answer: "Done" },
      modifiedAt: now - 60_000,
      chatId: "chat-recent",
    }
    const oldSession: DiscoveredSession = {
      sessionId: "sess-old",
      provider: "codex",
      source: "cli",
      title: "",
      lastExchange: { question: "Recover archived release work", answer: "Loaded" },
      modifiedAt: now - 30 * 24 * 60 * 60 * 1000,
      chatId: null,
    }

    const defaultView = getVisibleSessions({
      sessions: [recentSession, oldSession],
      searchQuery: "",
      windowDays: 7,
      now,
    })
    expect(defaultView.sessions.map((session) => session.sessionId)).toEqual(["sess-recent"])
    expect(defaultView.hasMore).toBe(true)

    const searchView = getVisibleSessions({
      sessions: [recentSession, oldSession],
      searchQuery: "archived release",
      windowDays: 7,
      now,
    })
    expect(searchView.sessions.map((session) => session.sessionId)).toEqual(["sess-old"])
    expect(searchView.hasMore).toBe(false)
  })
})
