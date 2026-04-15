import { afterEach, describe, expect, test } from "bun:test"
import {
  getAwaitingChatComposerPlaceholderText,
  getChatComposerPlaceholderText,
} from "../../lib/quirkyCopy"
import {
  getComposerActionDisabledState,
  getQueueActionDisabledState,
  getComposerControlsKey,
  getRestoredQueuedTextOnArrowUp,
  hasTrimmedText,
  shouldQueueOnSubmitKeystroke,
  resolveComposerPreferences,
  resolvePlanModeState,
  shouldClearDraftAfterSubmit,
  shouldShowQueueAction,
  shouldShowQueuedBlock,
  ChatInput,
} from "./ChatInput"
import { type ComposerState, useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { PROVIDERS } from "../../../shared/types"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

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

describe("awaiting composer placeholder", () => {
  test("rotates through the curated composer placeholder pool while preserving the stable first line", () => {
    const first = getChatComposerPlaceholderText("chat-1")
    const second = getAwaitingChatComposerPlaceholderText("chat-1", 1)
    const later = getAwaitingChatComposerPlaceholderText("chat-1", 2)

    expect(getAwaitingChatComposerPlaceholderText("chat-1", 0)).toBe(first)
    expect(second).not.toBe(first)
    expect(later).not.toBe(second)
  })
})

describe("hasTrimmedText", () => {
  test("treats whitespace-only drafts as empty", () => {
    expect(hasTrimmedText("")).toBe(false)
    expect(hasTrimmedText("   \n")).toBe(false)
    expect(hasTrimmedText(" x ")).toBe(true)
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

describe("resolveComposerPreferences with runtimeModel", () => {
  test("uses runtimeModel when provider is locked and composerState has a different model", () => {
    const composerState: ComposerState = {
      provider: "claude",
      model: "sonnet",
      modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
      planMode: false,
    }

    const resolved = resolveComposerPreferences({
      activeProvider: "claude",
      composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedOverrides: null,
      runtimeModel: "opus",
    })

    expect(resolved.selectedProvider).toBe("claude")
    expect(resolved.providerPrefs.model).toBe("opus")
  })

  test("uses runtimeModel even when composer provider differs from locked provider", () => {
    const composerState: ComposerState = {
      provider: "codex",
      model: "gpt-5.4",
      modelOptions: { reasoningEffort: "high", fastMode: false },
      planMode: false,
    }

    const resolved = resolveComposerPreferences({
      activeProvider: "claude",
      composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedOverrides: null,
      runtimeModel: "haiku",
    })

    expect(resolved.selectedProvider).toBe("claude")
    expect(resolved.providerPrefs.model).toBe("haiku")
  })

  test("falls back to composerState model when no runtimeModel is provided", () => {
    const composerState: ComposerState = {
      provider: "claude",
      model: "sonnet",
      modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
      planMode: false,
    }

    const resolved = resolveComposerPreferences({
      activeProvider: "claude",
      composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedOverrides: null,
    })

    expect(resolved.providerPrefs.model).toBe("sonnet")
  })

  test("ignores runtimeModel when provider is not locked", () => {
    const composerState: ComposerState = {
      provider: "claude",
      model: "sonnet",
      modelOptions: { reasoningEffort: "high", contextWindow: "200k" },
      planMode: false,
    }

    const resolved = resolveComposerPreferences({
      activeProvider: null,
      composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedOverrides: null,
      runtimeModel: "opus",
    })

    expect(resolved.providerPrefs.model).toBe("sonnet")
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

describe("queue action", () => {
  test("shows an explicit queue action while cancel is available", () => {
    expect(shouldShowQueueAction(true)).toBe(true)
    expect(shouldShowQueueAction(false)).toBe(false)
  })

  test("disables queue when the composer is disabled or empty", () => {
    expect(getQueueActionDisabledState({ disabled: true, value: "Queued follow-up" })).toBe(true)
    expect(getQueueActionDisabledState({ disabled: false, value: "   " })).toBe(true)
    expect(getQueueActionDisabledState({ disabled: false, value: "Queued follow-up" })).toBe(false)
  })

  test("renders stop and queue icon controls side-by-side while processing", () => {
    const html = renderToStaticMarkup(
      createElement(ChatInput, {
        onSubmit: async () => "queued",
        onCancel: () => {},
        disabled: false,
        canCancel: true,
        chatId: "chat-1",
        connectionStatus: "connected",
        activeProvider: null,
        availableProviders: PROVIDERS,
      })
    )

    expect(html).toContain("aria-label=\"Stop\"")
    expect(html).toContain("aria-label=\"Queue\"")
  })

  test("keeps awaiting actions from stealing the mobile textarea shrink space", () => {
    const html = renderToStaticMarkup(
      createElement(ChatInput, {
        onSubmit: async () => "queued",
        onCancel: () => {},
        disabled: false,
        canCancel: true,
        chatId: "chat-1",
        connectionStatus: "connected",
        activeProvider: null,
        availableProviders: PROVIDERS,
      })
    )

    expect(html).toContain("min-w-0")
    expect(html).toContain("flex-shrink-0 mb-1 -mr-0.5")
    expect(html).toContain("aria-label=\"Queue\"")
    expect(html).toContain("flex-shrink-0 h-10 w-10")
  })

  test("renders queued drafts with a distinct pending-state treatment", () => {
    const html = renderToStaticMarkup(
      createElement(ChatInput, {
        onSubmit: async () => "queued",
        disabled: false,
        canCancel: false,
        chatId: "chat-1",
        queuedText: "Queued follow-up",
        connectionStatus: "connected",
        activeProvider: null,
        availableProviders: PROVIDERS,
      })
    )

    expect(html).toContain("Queued")
    expect(html).toContain("border-dashed")
    expect(html).toContain("bg-amber")
  })

  test("treats submit keystrokes as queue requests while busy", () => {
    expect(shouldQueueOnSubmitKeystroke({
      key: "Enter",
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      canCancel: true,
      isTouchDevice: false,
    })).toBe(true)

    expect(shouldQueueOnSubmitKeystroke({
      key: "Enter",
      shiftKey: false,
      metaKey: true,
      ctrlKey: false,
      canCancel: true,
      isTouchDevice: false,
    })).toBe(true)

    expect(shouldQueueOnSubmitKeystroke({
      key: "Enter",
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      canCancel: true,
      isTouchDevice: false,
    })).toBe(false)
  })
})

describe("composer reconnect feedback", () => {
  test("disables composer actions while reconnecting or fading back from success", () => {
    expect(getComposerActionDisabledState({ disabled: false, reconnectVisualState: "idle" })).toBe(false)
    expect(getComposerActionDisabledState({ disabled: false, reconnectVisualState: "reconnecting" })).toBe(true)
    expect(getComposerActionDisabledState({ disabled: false, reconnectVisualState: "reconnected" })).toBe(true)
    expect(getComposerActionDisabledState({ disabled: true, reconnectVisualState: "idle" })).toBe(true)
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
