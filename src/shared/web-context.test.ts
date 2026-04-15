import { describe, expect, test } from "bun:test"
import { getWebContextPrompt } from "./web-context"

describe("getWebContextPrompt", () => {
  test("returns a non-empty string for both providers", () => {
    expect(getWebContextPrompt("claude").length).toBeGreaterThan(0)
    expect(getWebContextPrompt("codex").length).toBeGreaterThan(0)
  })

  test("includes Tinkaria and web-based interface for both providers", () => {
    for (const provider of ["claude", "codex"] as const) {
      const prompt = getWebContextPrompt(provider)
      expect(prompt).toContain("Tinkaria")
      expect(prompt).toContain("web-based interface")
    }
  })

  test("mentions the correct provider name", () => {
    expect(getWebContextPrompt("claude")).toContain("Claude Code")
    expect(getWebContextPrompt("codex")).toContain("Codex")
    expect(getWebContextPrompt("codex")).not.toContain("Claude Code")
  })

  test("includes the current rich-content viewer contract and plan mode context", () => {
    for (const provider of ["claude", "codex"] as const) {
      const prompt = getWebContextPrompt(provider)
      expect(prompt).toContain("The transcript supports rich markdown natively")
      expect(prompt).toContain("rich-content cards")
      expect(prompt).toContain("collapse/expand, copy, and opening the content in a larger overlay viewer")
      expect(prompt).toContain("`html` for rendered embeds")
      expect(prompt).toContain("`d2` for source-only previews")
      expect(prompt).toContain("table of contents")
      expect(prompt).toContain("render/source toggle and zoom controls")
      expect(prompt).toContain("Prefer direct rich embeds or structured artifact cards over bare links")
      expect(prompt).toContain("Plan mode")
    }
  })

  test("describes cross-session orchestration as explicit tool-mediated chat coordination", () => {
    for (const provider of ["claude", "codex"] as const) {
      const prompt = getWebContextPrompt(provider)
      expect(prompt).toContain("spawn_agent")
      expect(prompt).toContain("list_agents")
      expect(prompt).toContain("fork_context")
      expect(prompt).toContain("send_input")
      expect(prompt).toContain("wait_agent")
      expect(prompt).toContain("close_agent")
      expect(prompt).toContain("not hidden shared memory")
      expect(prompt).toContain("Do not assume delegated chats share")
    }
  })

  test("orchestration block describes workflow semantics and accumulation pattern", () => {
    for (const provider of ["claude", "codex"] as const) {
      const prompt = getWebContextPrompt(provider)
      // Workflow: spawn creates child, wait returns its result
      expect(prompt).toContain("child session")
      // Accumulation: send_input for follow-ups and iterative refinement
      expect(prompt).toContain("send_input")
      expect(prompt).toMatch(/follow-up|steer|accumulate/i)
      // Report instruction: child should end with a structured report
      expect(prompt).toMatch(/report/i)
      // Concurrency: multiple children
      expect(prompt).toMatch(/multiple.*concurrent|concurrently/i)
    }
  })

  test("mentions present_content for codex only when the tool is advertised", () => {
    const enabledPrompt = getWebContextPrompt("codex", { presentContentEnabled: true })
    const disabledPrompt = getWebContextPrompt("codex", { presentContentEnabled: false })

    expect(enabledPrompt).toContain("present_content")
    expect(enabledPrompt).toContain("implementation plans")
    expect(enabledPrompt).toContain("comparison tables")
    expect(enabledPrompt).toContain("concise status summaries")
    expect(enabledPrompt).toContain("direct embeds")
    expect(enabledPrompt).toContain("dedicated artifact card")
    expect(enabledPrompt).toContain("easier to scan or interact with")
    expect(disabledPrompt).not.toContain("present_content")
  })

  test("never mentions present_content for claude", () => {
    const prompt = getWebContextPrompt("claude", { presentContentEnabled: true })
    expect(prompt).not.toContain("present_content")
  })

  test("mentions ask_user_question for codex only when the tool is advertised", () => {
    const enabledPrompt = getWebContextPrompt("codex", { askUserQuestionEnabled: true })
    const disabledPrompt = getWebContextPrompt("codex", { askUserQuestionEnabled: false })

    expect(enabledPrompt).toContain("ask_user_question")
    expect(enabledPrompt).toContain("clarification")
    expect(enabledPrompt).toContain("user input")
    expect(enabledPrompt).toContain("Default mode")
    expect(enabledPrompt).toContain("request_user_input")
    expect(disabledPrompt).not.toContain("ask_user_question")
  })

  test("never mentions ask_user_question for claude", () => {
    const prompt = getWebContextPrompt("claude", { askUserQuestionEnabled: true })
    expect(prompt).not.toContain("ask_user_question")
  })
})
