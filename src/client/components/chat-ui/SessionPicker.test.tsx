import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SessionPickerContent } from "./SessionPicker"
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
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        hasMore={false}
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
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        hasMore={false}
        isRefreshing={false}
      />
    )

    expect(html).toContain("No sessions")
  })
})
