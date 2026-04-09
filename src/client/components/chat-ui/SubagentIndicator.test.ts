import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { OrchestrationChildStatus, OrchestrationChildNode } from "../../../shared/types"
import { SubagentIndicator } from "./SubagentIndicator"

// Replicate helpers from SubagentIndicator for unit testing
// (component owns the logic, tests verify the contracts)

function isActiveStatus(status: OrchestrationChildStatus): boolean {
  return status === "spawning" || status === "running" || status === "waiting"
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m${seconds > 0 ? `${seconds}s` : ""}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`
}

function countNodes(nodes: OrchestrationChildNode[]): { total: number; active: number; failed: number } {
  let total = 0
  let active = 0
  let failed = 0
  for (const node of nodes) {
    total += 1
    if (isActiveStatus(node.status)) active += 1
    if (node.status === "failed") failed += 1
    const sub = countNodes(node.children)
    total += sub.total
    active += sub.active
    failed += sub.failed
  }
  return { total, active, failed }
}

function allTerminal(nodes: OrchestrationChildNode[]): boolean {
  return nodes.every((n) => !isActiveStatus(n.status) && allTerminal(n.children))
}

function makeNode(overrides: Partial<OrchestrationChildNode> & { chatId: string }): OrchestrationChildNode {
  return {
    status: "running",
    spawnedAt: Date.now() - 60_000,
    lastStatusAt: Date.now(),
    instruction: "test task",
    children: [],
    ...overrides,
  }
}

describe("SubagentIndicator helpers", () => {
  describe("isActiveStatus", () => {
    test("spawning is active", () => expect(isActiveStatus("spawning")).toBe(true))
    test("running is active", () => expect(isActiveStatus("running")).toBe(true))
    test("waiting is active", () => expect(isActiveStatus("waiting")).toBe(true))
    test("completed is not active", () => expect(isActiveStatus("completed")).toBe(false))
    test("failed is not active", () => expect(isActiveStatus("failed")).toBe(false))
    test("closed is not active", () => expect(isActiveStatus("closed")).toBe(false))
  })

  describe("formatElapsed", () => {
    test("seconds only", () => expect(formatElapsed(45_000)).toBe("45s"))
    test("exact minute", () => expect(formatElapsed(60_000)).toBe("1m"))
    test("minutes and seconds", () => expect(formatElapsed(92_000)).toBe("1m32s"))
    test("exact hour", () => expect(formatElapsed(3_600_000)).toBe("1h"))
    test("hours and minutes", () => expect(formatElapsed(3_720_000)).toBe("1h2m"))
    test("zero", () => expect(formatElapsed(0)).toBe("0s"))
  })

  describe("countNodes", () => {
    test("empty array", () => {
      expect(countNodes([])).toEqual({ total: 0, active: 0, failed: 0 })
    })

    test("flat list", () => {
      const nodes = [
        makeNode({ chatId: "a", status: "running" }),
        makeNode({ chatId: "b", status: "completed" }),
        makeNode({ chatId: "c", status: "failed" }),
      ]
      expect(countNodes(nodes)).toEqual({ total: 3, active: 1, failed: 1 })
    })

    test("nested tree", () => {
      const nodes = [
        makeNode({
          chatId: "a",
          status: "running",
          children: [
            makeNode({ chatId: "a1", status: "waiting" }),
            makeNode({ chatId: "a2", status: "completed" }),
          ],
        }),
      ]
      expect(countNodes(nodes)).toEqual({ total: 3, active: 2, failed: 0 })
    })
  })

  describe("allTerminal", () => {
    test("empty is terminal", () => expect(allTerminal([])).toBe(true))

    test("all completed is terminal", () => {
      expect(allTerminal([
        makeNode({ chatId: "a", status: "completed" }),
        makeNode({ chatId: "b", status: "closed" }),
      ])).toBe(true)
    })

    test("one running is not terminal", () => {
      expect(allTerminal([
        makeNode({ chatId: "a", status: "completed" }),
        makeNode({ chatId: "b", status: "running" }),
      ])).toBe(false)
    })

    test("nested active is not terminal", () => {
      expect(allTerminal([
        makeNode({
          chatId: "a",
          status: "completed",
          children: [makeNode({ chatId: "a1", status: "spawning" })],
        }),
      ])).toBe(false)
    })
  })
})

describe("SubagentIndicator", () => {
  test("renders nothing when no hierarchy is available", () => {
    const html = renderToStaticMarkup(createElement(SubagentIndicator, { hierarchy: null }))

    expect(html).toBe("")
  })

  test("renders running summary when spawned agents are present", () => {
    const html = renderToStaticMarkup(
      createElement(SubagentIndicator, {
        hierarchy: {
          children: [
            makeNode({ chatId: "agent-1", status: "running", instruction: "Inspect regression" }),
            makeNode({ chatId: "agent-2", status: "failed", instruction: "Review failing path" }),
          ],
        },
      }),
    )

    expect(html).toContain("1 running")
    expect(html).toContain("1 failed")
    expect(html).toContain("chat.composer.subagents.indicator")
  })
})
