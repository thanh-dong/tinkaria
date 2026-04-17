import { describe, test, expect } from "bun:test"
import { extractWaypoints, truncateLabel, findCurrentWaypointIndex, type ChatWaypoint } from "./chatWaypoints"
import type { TranscriptRenderUnit } from "../../shared/types"

function makeUserPrompt(id: string, content: string): TranscriptRenderUnit {
  return {
    kind: "user_prompt",
    id: `unit-${id}`,
    sourceEntryIds: [id],
    message: { kind: "user_prompt", id, content, timestamp: "2026-01-01T00:00:00Z" } as any,
  }
}

function makeAssistantResponse(id: string): TranscriptRenderUnit {
  return {
    kind: "assistant_response",
    id: `unit-${id}`,
    sourceEntryIds: [id],
    message: { kind: "assistant_text", id, content: "response", timestamp: "2026-01-01T00:00:00Z" } as any,
  }
}

function makeToolGroup(id: string): TranscriptRenderUnit {
  return {
    kind: "tool_group",
    id: `tools-${id}`,
    sourceEntryIds: [id],
    tools: [],
  } as any
}

describe("truncateLabel", () => {
  test("returns short text unchanged", () => {
    expect(truncateLabel("hello", 30)).toBe("hello")
  })

  test("truncates long text with ellipsis", () => {
    const long = "This is a very long prompt that should be truncated"
    const result = truncateLabel(long, 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith("\u2026")).toBe(true)
  })

  test("uses only first line of multiline text", () => {
    const multiline = "First line\nSecond line\nThird line"
    expect(truncateLabel(multiline, 50)).toBe("First line")
  })

  test("truncates first line if it exceeds maxChars", () => {
    const multiline = "This is a very long first line that exceeds the limit\nSecond line"
    const result = truncateLabel(multiline, 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith("\u2026")).toBe(true)
  })

  test("handles CRLF line endings", () => {
    expect(truncateLabel("First line\r\nSecond line", 50)).toBe("First line")
  })

  test("handles empty string", () => {
    expect(truncateLabel("", 30)).toBe("")
  })

  test("handles exactly maxChars length", () => {
    const exact = "12345678901234567890"
    expect(truncateLabel(exact, 20)).toBe(exact)
  })
})

describe("extractWaypoints", () => {
  test("returns empty for no messages", () => {
    expect(extractWaypoints([])).toEqual([])
  })

  test("extracts only user_prompt units", () => {
    const messages: TranscriptRenderUnit[] = [
      makeUserPrompt("e1", "What is React?"),
      makeAssistantResponse("e2"),
      makeUserPrompt("e3", "How about Vue?"),
      makeToolGroup("e4"),
      makeUserPrompt("e5", "And Svelte?"),
    ]

    const waypoints = extractWaypoints(messages)
    expect(waypoints).toHaveLength(3)
    expect(waypoints[0]).toEqual({
      renderIndex: 0,
      domId: "msg-e1",
      label: "What is React?",
    })
    expect(waypoints[1]).toEqual({
      renderIndex: 2,
      domId: "msg-e3",
      label: "How about Vue?",
    })
    expect(waypoints[2]).toEqual({
      renderIndex: 4,
      domId: "msg-e5",
      label: "And Svelte?",
    })
  })

  test("skips non-user-prompt units", () => {
    const messages: TranscriptRenderUnit[] = [
      makeAssistantResponse("e1"),
      makeToolGroup("e2"),
    ]
    expect(extractWaypoints(messages)).toEqual([])
  })

  test("truncates long prompt labels", () => {
    const longPrompt = "A".repeat(100)
    const messages: TranscriptRenderUnit[] = [makeUserPrompt("e1", longPrompt)]
    const waypoints = extractWaypoints(messages)
    expect(waypoints[0].label.length).toBeLessThanOrEqual(60)
  })
})

describe("findCurrentWaypointIndex", () => {
  function offsets(map: Record<number, number>): (wp: ChatWaypoint) => number | null {
    return (wp) => map[wp.renderIndex] ?? null
  }

  test("returns -1 when no waypoints", () => {
    expect(findCurrentWaypointIndex([], 0, offsets({}))).toBe(-1)
  })

  test("returns 0 when scrolled past first waypoint only", () => {
    const waypoints: ChatWaypoint[] = [
      { renderIndex: 0, domId: "msg-e1", label: "Q1" },
      { renderIndex: 2, domId: "msg-e3", label: "Q2" },
    ]
    expect(findCurrentWaypointIndex(waypoints, 150, offsets({
      0: 100,
      2: 500,
    }))).toBe(0)
  })

  test("returns last waypoint index when scrolled past all", () => {
    const waypoints: ChatWaypoint[] = [
      { renderIndex: 0, domId: "msg-e1", label: "Q1" },
      { renderIndex: 2, domId: "msg-e3", label: "Q2" },
      { renderIndex: 4, domId: "msg-e5", label: "Q3" },
    ]
    expect(findCurrentWaypointIndex(waypoints, 1000, offsets({
      0: 100,
      2: 500,
      4: 900,
    }))).toBe(2)
  })

  test("returns -1 when scrolled before first waypoint", () => {
    const waypoints: ChatWaypoint[] = [
      { renderIndex: 0, domId: "msg-e1", label: "Q1" },
    ]
    expect(findCurrentWaypointIndex(waypoints, 50, offsets({
      0: 500,
    }))).toBe(-1)
  })

  test("snaps to waypoint within threshold", () => {
    const waypoints: ChatWaypoint[] = [
      { renderIndex: 0, domId: "msg-e1", label: "Q1" },
    ]
    // scrollTop 60, waypoint at 100, threshold is 50 → 100 <= 60+50=110 → match
    expect(findCurrentWaypointIndex(waypoints, 60, offsets({
      0: 100,
    }))).toBe(0)
  })

  test("skips waypoints with unmeasured items", () => {
    const waypoints: ChatWaypoint[] = [
      { renderIndex: 0, domId: "msg-e1", label: "Q1" },
      { renderIndex: 2, domId: "msg-e3", label: "Q2" },
    ]
    // renderIndex 2 not measured
    expect(findCurrentWaypointIndex(waypoints, 600, offsets({
      0: 100,
    }))).toBe(0)
  })
})
