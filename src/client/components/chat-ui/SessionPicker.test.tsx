import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SessionPickerContent, getVisibleSessions } from "./SessionPicker"
import type { DiscoveredSession } from "../../../shared/types"

const mockSessions: DiscoveredSession[] = [
  {
    sessionId: "sess-1",
    provider: "claude",
    source: "kanna",
    title: "Fix auth bug",
    lastExchange: { question: "Fix the auth bug", answer: "Done" },
    modifiedAt: Date.now() - 3600_000,
    kannaChatId: "chat-1",
  },
  {
    sessionId: "sess-2",
    provider: "codex",
    source: "cli",
    title: "",
    lastExchange: { question: "Add unit tests for login", answer: "Here are the tests" },
    modifiedAt: Date.now() - 7200_000,
    kannaChatId: null,
  },
]

describe("SessionPickerContent", () => {
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

    expect(html).toContain("Fix auth bug")
    expect(html).toContain("Add unit tests for login")
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
      kannaChatId: null,
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
      source: "kanna",
      title: "Recent session",
      lastExchange: { question: "Recent session", answer: "Done" },
      modifiedAt: now - 60_000,
      kannaChatId: "chat-recent",
    }
    const oldSession: DiscoveredSession = {
      sessionId: "sess-old",
      provider: "codex",
      source: "cli",
      title: "",
      lastExchange: { question: "Recover archived release work", answer: "Loaded" },
      modifiedAt: now - 30 * 24 * 60 * 60 * 1000,
      kannaChatId: null,
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
