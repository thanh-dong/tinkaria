import { afterEach, describe, expect, test } from "bun:test"
import {
  getComposerControlsKey,
  getRestoredQueuedTextOnArrowUp,
  resolveComposerPreferences,
  resolvePlanModeState,
  shouldClearDraftAfterSubmit,
  shouldShowQueuedBlock,
} from "./ChatInput"
import { type ComposerState, useChatPreferencesStore } from "../../stores/chatPreferencesStore"

const INITIAL_STATE = useChatPreferencesStore.getInitialState()

afterEach(() => {
  useChatPreferencesStore.setState(INITIAL_STATE, true)
})

describe("getComposerControlsKey", () => {
  test("changes when the active provider identity changes", () => {
    expect(getComposerControlsKey("chat-1", "codex")).toBe("chat-1:codex")
    expect(getComposerControlsKey("chat-1", "claude")).toBe("chat-1:claude")
    expect(getComposerControlsKey("chat-1", "codex")).not.toBe(getComposerControlsKey("chat-1", "claude"))
  })
})

describe("resolveComposerPreferences", () => {
  test("derives locked prefs from the active provider instead of carrying prior identity state", () => {
    const composerState: ComposerState = {
      provider: "codex",
      model: "gpt-5.3-codex-spark",
      modelOptions: { reasoningEffort: "high", fastMode: true },
      planMode: true,
    }

    const codexResolved = resolveComposerPreferences({
      activeProvider: "codex",
      composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedOverrides: null,
    })

    const claudeResolved = resolveComposerPreferences({
      activeProvider: "claude",
      composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedOverrides: null,
    })

    expect(codexResolved.selectedProvider).toBe("codex")
    expect(codexResolved.providerPrefs.model).toBe("gpt-5.3-codex-spark")
    expect(claudeResolved.selectedProvider).toBe("claude")
    expect(claudeResolved.providerPrefs.model).toBe("opus")
  })
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
