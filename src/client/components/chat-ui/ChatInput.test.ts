import { afterEach, describe, expect, test } from "bun:test"
import {
  getRestoredQueuedTextOnArrowUp,
  resolvePlanModeState,
  shouldClearDraftAfterSubmit,
  shouldShowQueuedBlock,
} from "./ChatInput"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"

const INITIAL_STATE = useChatPreferencesStore.getInitialState()

afterEach(() => {
  useChatPreferencesStore.setState(INITIAL_STATE)
})

describe("resolvePlanModeState", () => {
  test("updates composer plan mode when the provider is not locked", () => {
    const result = resolvePlanModeState({
      providerLocked: false,
      planMode: true,
      selectedProvider: "claude",
      composerState: INITIAL_STATE.composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedComposerState: null,
    })

    expect(result).toEqual({
      composerPlanMode: true,
      lockedComposerState: null,
    })
  })

  test("updates only the locked state when the provider is locked", () => {
    const result = resolvePlanModeState({
      providerLocked: true,
      planMode: true,
      selectedProvider: "claude",
      composerState: {
        provider: "claude",
        model: "opus",
        modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
        planMode: false,
      },
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedComposerState: null,
    })

    expect(result.composerPlanMode).toBe(false)
    expect(result.lockedComposerState).toEqual({
      provider: "claude",
      model: "opus",
      modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
      planMode: true,
    })
  })

  test("reuses existing locked state instead of resetting to provider defaults", () => {
    const result = resolvePlanModeState({
      providerLocked: true,
      planMode: false,
      selectedProvider: "claude",
      composerState: {
        provider: "claude",
        model: "haiku",
        modelOptions: { reasoningEffort: "low" },
        planMode: true,
      },
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        claude: {
          model: "sonnet",
          modelOptions: { reasoningEffort: "max", contextWindow: "200k" },
          planMode: true,
        },
      },
      lockedComposerState: {
        provider: "claude",
        model: "opus",
        modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
        planMode: true,
      },
    })

    expect(result.composerPlanMode).toBe(true)
    expect(result.lockedComposerState).toEqual({
      provider: "claude",
      model: "opus",
      modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
      planMode: false,
    })
  })
})

describe("shouldShowQueuedBlock", () => {
  test("returns true when queued text exists", () => {
    expect(shouldShowQueuedBlock("Check layout")).toBe(true)
  })

  test("returns false when queued text is empty", () => {
    expect(shouldShowQueuedBlock("   ")).toBe(false)
  })
})

describe("getRestoredQueuedTextOnArrowUp", () => {
  test("restores the queue only when the textarea is empty", () => {
    expect(getRestoredQueuedTextOnArrowUp("", "Queued follow-up")).toBe("Queued follow-up")
    expect(getRestoredQueuedTextOnArrowUp("draft", "Queued follow-up")).toBeNull()
  })
})

describe("shouldClearDraftAfterSubmit", () => {
  test("clears persisted drafts for queued and sent submits", () => {
    expect(shouldClearDraftAfterSubmit("queued")).toBe(true)
    expect(shouldClearDraftAfterSubmit("sent")).toBe(true)
  })
})
