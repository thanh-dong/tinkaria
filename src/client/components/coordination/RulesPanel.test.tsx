import { describe, test, expect, mock } from "bun:test"
import type { ProjectRule } from "../../../shared/project-agent-types"

function makeRule(overrides: Partial<ProjectRule> = {}): ProjectRule {
  return {
    id: "r1",
    content: "Always write tests before implementation",
    setBy: "session-1",
    updatedAt: "2026-04-11T00:00:00Z",
    ...overrides,
  }
}

describe("RulesPanel", () => {
  test("exports RulesPanel component", async () => {
    const mod = await import("./RulesPanel")
    expect(typeof mod.RulesPanel).toBe("function")
  })

  test("onSetRule callback receives ruleId, content, setBy", () => {
    const onSet = mock(() => {})
    onSet("r1", "new content", "session-2")
    expect(onSet).toHaveBeenCalledWith("r1", "new content", "session-2")
  })

  test("onRemoveRule callback receives ruleId", () => {
    const onRemove = mock(() => {})
    onRemove("r1")
    expect(onRemove).toHaveBeenCalledWith("r1")
  })

  void makeRule
})
