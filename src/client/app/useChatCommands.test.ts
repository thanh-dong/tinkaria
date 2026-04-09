import { describe, expect, test } from "bun:test"
import type { ChatRuntime } from "../../shared/types"
import {
  resolveRequestedSessionModel,
  shouldForkForIncompatibleSessionTarget,
} from "./useChatCommands"

function makeRuntime(overrides: Partial<ChatRuntime> = {}): ChatRuntime {
  return {
    chatId: "chat-1",
    projectId: "project-1",
    localPath: "/tmp/project",
    title: "Chat",
    status: "idle",
    provider: "claude",
    model: "sonnet[1m]",
    planMode: false,
    sessionToken: "session-1",
    ...overrides,
  }
}

describe("useChatCommands session-target compatibility", () => {
  test("resolves claude model identity with context window", () => {
    const requested = resolveRequestedSessionModel(makeRuntime(), {
      provider: "claude",
      model: "sonnet",
      modelOptions: {
        claude: {
          reasoningEffort: "high",
          contextWindow: "1m",
        },
      },
    })

    expect(requested).toBe("sonnet[1m]")
  })

  test("does not fork when the requested live target matches the current session", () => {
    expect(shouldForkForIncompatibleSessionTarget(makeRuntime(), {
      provider: "claude",
      model: "sonnet",
      modelOptions: {
        claude: {
          reasoningEffort: "high",
          contextWindow: "1m",
        },
      },
    })).toBe(false)
  })

  test("forks when the requested live model differs from the current session", () => {
    expect(shouldForkForIncompatibleSessionTarget(makeRuntime(), {
      provider: "claude",
      model: "opus",
      modelOptions: {
        claude: {
          reasoningEffort: "high",
          contextWindow: "200k",
        },
      },
    })).toBe(true)
  })

  test("forks when a live session model is unknown", () => {
    expect(shouldForkForIncompatibleSessionTarget(makeRuntime({ model: null }), {
      provider: "claude",
      model: "sonnet",
      modelOptions: {
        claude: {
          reasoningEffort: "high",
          contextWindow: "200k",
        },
      },
    })).toBe(true)
  })

  test("does not fork when there is no live session token", () => {
    expect(shouldForkForIncompatibleSessionTarget(makeRuntime({ sessionToken: null }), {
      provider: "claude",
      model: "opus",
      modelOptions: {
        claude: {
          reasoningEffort: "high",
          contextWindow: "200k",
        },
      },
    })).toBe(false)
  })

  test("forks when the requested provider changes", () => {
    expect(shouldForkForIncompatibleSessionTarget(makeRuntime({
      provider: "claude",
      model: "sonnet[1m]",
    }), {
      provider: "codex",
      model: "gpt-5.4",
      modelOptions: {
        codex: {
          reasoningEffort: "high",
          fastMode: false,
        },
      },
    })).toBe(true)
  })
})
