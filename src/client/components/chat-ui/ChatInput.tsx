import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { ArrowUp, ClockPlus } from "lucide-react"
import {
  type AgentProvider,
  type ClaudeModelOptions,
  type CodexModelOptions,
  type ModelOptions,
  type ProviderCatalogEntry,
  PROVIDERS,
  normalizeClaudeContextWindow,
} from "../../../shared/types"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { createUiIdentity, createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
import { useIsStandalone } from "../../hooks/useIsStandalone"
import { useChatInputStore } from "../../stores/chatInputStore"
import { type ComposerState, useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { useSkillCompositionStore, computeSkillInsertion, formatSkillCommand } from "../../stores/skillCompositionStore"
import { CHAT_INPUT_ATTRIBUTE, focusNextChatInput } from "../../app/chatFocusPolicy"
import { ChatPreferenceControls, type ModelOptionChange } from "./ChatPreferenceControls"
import { SkillRibbon } from "./SkillRibbon"

interface Props {
  onSubmit: (
    value: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<"queued" | "sent">
  onCancel?: () => void
  queuedText?: string
  onClearQueuedText?: () => void
  onRestoreQueuedText?: () => string
  disabled: boolean
  canCancel?: boolean
  chatId?: string | null
  activeProvider: AgentProvider | null
  availableProviders: ProviderCatalogEntry[]
  availableSkills?: string[]
}

function withNormalizedContextWindow(
  state: ComposerState,
  model: string
): ComposerState {
  if (state.provider !== "claude") return { ...state, model }
  return {
    ...state,
    model,
    modelOptions: {
      ...state.modelOptions,
      contextWindow: normalizeClaudeContextWindow(model, state.modelOptions.contextWindow),
    },
  }
}

function logChatInput(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[ChatInput] ${message}`)
    return
  }

  console.info(`[ChatInput] ${message}`, details)
}

function createLockedComposerState(
  provider: AgentProvider,
  composerState: ComposerState,
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
): ComposerState {
  if (provider === "claude") {
    if (composerState.provider === "claude") {
      return {
        provider: "claude",
        model: composerState.model,
        modelOptions: { ...composerState.modelOptions },
        planMode: composerState.planMode,
      }
    }

    return {
      provider: "claude",
      model: providerDefaults.claude.model,
      modelOptions: { ...providerDefaults.claude.modelOptions },
      planMode: providerDefaults.claude.planMode,
    }
  }

  if (composerState.provider === "codex") {
    return {
      provider: "codex",
      model: composerState.model,
      modelOptions: { ...composerState.modelOptions },
      planMode: composerState.planMode,
    }
  }

  return {
    provider: "codex",
    model: providerDefaults.codex.model,
    modelOptions: { ...providerDefaults.codex.modelOptions },
    planMode: providerDefaults.codex.planMode,
  }
}

export function resolvePlanModeState(args: {
  providerLocked: boolean
  planMode: boolean
  selectedProvider: AgentProvider
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  lockedComposerState: ComposerState | null
}) {
  if (!args.providerLocked) {
    return {
      composerPlanMode: args.planMode,
      lockedComposerState: args.lockedComposerState,
    }
  }

  const nextLockedState = args.lockedComposerState
    ?? createLockedComposerState(args.selectedProvider, args.composerState, args.providerDefaults)

  return {
    composerPlanMode: args.composerState.planMode,
    lockedComposerState: {
      ...nextLockedState,
      planMode: args.planMode,
    } satisfies ComposerState,
  }
}

export function shouldShowQueuedBlock(queuedText: string): boolean {
  return queuedText.trim().length > 0
}

export function shouldShowQueueAction(canCancel: boolean): boolean {
  return canCancel
}

export function getQueueActionDisabledState(args: { disabled: boolean; value: string }): boolean {
  return args.disabled || !args.value.trim()
}

export function shouldQueueOnSubmitKeystroke(args: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  canCancel: boolean | undefined
  isTouchDevice: boolean
}): boolean {
  if (args.key !== "Enter" || args.shiftKey) return false
  if (!args.canCancel) return false
  return args.metaKey || args.ctrlKey || !args.isTouchDevice
}

export function getRestoredQueuedTextOnArrowUp(value: string, queuedText: string): string | null {
  if (value.trim().length > 0) return null
  return queuedText.trim().length > 0 ? queuedText : null
}

export function shouldClearDraftAfterSubmit(submitResult: "queued" | "sent"): boolean {
  return submitResult === "queued" || submitResult === "sent"
}

export function getComposerControlsKey(chatId: string | null | undefined, activeProvider: AgentProvider | null): string {
  return `${chatId ?? "__new__"}:${activeProvider ?? "unlocked"}`
}

export function resolveComposerPreferences(args: {
  activeProvider: AgentProvider | null
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  lockedOverrides: ComposerState | null
}) {
  const providerLocked = args.activeProvider !== null
  const selectedProvider = args.activeProvider ?? args.composerState.provider
  const lockedBaseState = args.activeProvider
    ? createLockedComposerState(args.activeProvider, args.composerState, args.providerDefaults)
    : null
  const providerPrefs = providerLocked
    ? args.lockedOverrides ?? lockedBaseState ?? args.composerState
    : args.composerState
  const providerConfig = PROVIDERS.find((provider) => provider.id === selectedProvider) ?? PROVIDERS[0]

  return {
    providerLocked,
    selectedProvider,
    lockedBaseState,
    providerPrefs,
    showPlanMode: providerConfig?.supportsPlanMode ?? false,
  }
}

interface ComposerPreferencesSnapshot {
  selectedProvider: AgentProvider
  providerPrefs: ComposerState
  showPlanMode: boolean
}

interface ComposerPreferencesHandle {
  getSnapshot: () => ComposerPreferencesSnapshot
  setPlanMode: (planMode: boolean) => void
}

interface ComposerPreferencesProps {
  activeProvider: AgentProvider | null
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  availableProviders: ProviderCatalogEntry[]
  availableSkills: string[]
  ribbonVisible: boolean
  toggleRibbon: () => void
  setComposerModel: (model: string) => void
  setComposerModelOptions: (modelOptions: Partial<ClaudeModelOptions> | Partial<CodexModelOptions>) => void
  setComposerPlanMode: (planMode: boolean) => void
  resetComposerFromProvider: (provider: AgentProvider) => void
}

const ComposerPreferenceControls = memo(forwardRef<ComposerPreferencesHandle, ComposerPreferencesProps>(function ComposerPreferenceControls({
  activeProvider,
  composerState,
  providerDefaults,
  availableProviders,
  availableSkills,
  ribbonVisible,
  toggleRibbon,
  setComposerModel,
  setComposerModelOptions,
  setComposerPlanMode,
  resetComposerFromProvider,
}, forwardedRef) {
  const [lockedOverrides, setLockedOverrides] = useState<ComposerState | null>(null)
  const resolved = resolveComposerPreferences({
    activeProvider,
    composerState,
    providerDefaults,
    lockedOverrides,
  })
  const providerConfig = availableProviders.find((provider) => provider.id === resolved.selectedProvider) ?? availableProviders[0]
  const showPlanMode = providerConfig?.supportsPlanMode ?? false

  const handleProviderChange = useCallback((provider: AgentProvider) => {
    if (resolved.providerLocked) return
    resetComposerFromProvider(provider)
  }, [resolved.providerLocked, resetComposerFromProvider])

  const handleModelChange = useCallback((_: AgentProvider, model: string) => {
    if (resolved.providerLocked) {
      setLockedOverrides((current) => {
        const next = current ?? resolved.lockedBaseState ?? createLockedComposerState(resolved.selectedProvider, composerState, providerDefaults)
        return withNormalizedContextWindow(next, model)
      })
      return
    }
    setComposerModel(model)
  }, [resolved.providerLocked, resolved.lockedBaseState, resolved.selectedProvider, composerState, providerDefaults, setComposerModel])

  const handleModelOptionChange = useCallback((change: ModelOptionChange) => {
    const doUpdate = (
      transform: (s: ComposerState) => ComposerState,
      fallback: () => void
    ) => {
      if (resolved.providerLocked) {
        setLockedOverrides((current) => {
          const next = current ?? resolved.lockedBaseState ?? createLockedComposerState(resolved.selectedProvider, composerState, providerDefaults)
          return transform(next)
        })
        return
      }
      fallback()
    }

    switch (change.type) {
      case "claudeReasoningEffort":
      case "codexReasoningEffort":
        doUpdate(
          (state) => ({
            ...state,
            modelOptions: { ...state.modelOptions, reasoningEffort: change.effort },
          } as ComposerState),
          () => setComposerModelOptions({ reasoningEffort: change.effort })
        )
        break
      case "contextWindow":
        doUpdate(
          (state) => state.provider !== "claude"
            ? state
            : withNormalizedContextWindow(
                { ...state, modelOptions: { ...state.modelOptions, contextWindow: change.contextWindow } },
                state.model
              ),
          () => setComposerModelOptions({ contextWindow: change.contextWindow })
        )
        break
      case "fastMode":
        doUpdate(
          (state) => state.provider === "claude"
            ? state
            : { ...state, modelOptions: { ...state.modelOptions, fastMode: change.fastMode } },
          () => setComposerModelOptions({ fastMode: change.fastMode })
        )
        break
    }
  }, [resolved.providerLocked, resolved.lockedBaseState, resolved.selectedProvider, composerState, providerDefaults, setComposerModelOptions])

  const handlePlanModeChange = useCallback((planMode: boolean) => {
    const nextState = resolvePlanModeState({
      providerLocked: resolved.providerLocked,
      planMode,
      selectedProvider: resolved.selectedProvider,
      composerState,
      providerDefaults,
      lockedComposerState: lockedOverrides,
    })

    if (resolved.providerLocked) {
      setLockedOverrides(nextState.lockedComposerState)
      return
    }

    if (nextState.composerPlanMode !== composerState.planMode) {
      setComposerPlanMode(nextState.composerPlanMode)
    }
  }, [resolved.providerLocked, resolved.selectedProvider, composerState, providerDefaults, lockedOverrides, setComposerPlanMode])

  useImperativeHandle(forwardedRef, () => ({
    getSnapshot: () => ({
      selectedProvider: resolved.selectedProvider,
      providerPrefs: resolved.providerPrefs,
      showPlanMode,
    }),
    setPlanMode: handlePlanModeChange,
  }), [resolved.selectedProvider, resolved.providerPrefs, showPlanMode, handlePlanModeChange])

  return (
    <ChatPreferenceControls
      availableProviders={availableProviders}
      selectedProvider={resolved.selectedProvider}
      providerLocked={resolved.providerLocked}
      model={resolved.providerPrefs.model}
      modelOptions={resolved.providerPrefs.modelOptions}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onModelOptionChange={handleModelOptionChange}
      planMode={resolved.providerPrefs.planMode}
      onPlanModeChange={handlePlanModeChange}
      includePlanMode={showPlanMode}
      showSkillsToggle={availableSkills.length > 0}
      skillsVisible={ribbonVisible}
      onSkillsToggle={toggleRibbon}
      className="max-w-[840px] mx-auto"
    />
  )
}))

const ChatInputInner = forwardRef<HTMLTextAreaElement, Props>(function ChatInput({
  onSubmit,
  onCancel,
  queuedText = "",
  onClearQueuedText,
  onRestoreQueuedText,
  disabled,
  canCancel,
  chatId,
  activeProvider,
  availableProviders,
  availableSkills = [],
}, forwardedRef) {
  const getDraft = useChatInputStore((s) => s.getDraft)
  const setDraft = useChatInputStore((s) => s.setDraft)
  const clearDraft = useChatInputStore((s) => s.clearDraft)
  const composerState = useChatPreferencesStore((s) => s.composerState)
  const providerDefaults = useChatPreferencesStore((s) => s.providerDefaults)
  const setComposerModel = useChatPreferencesStore((s) => s.setComposerModel)
  const setComposerModelOptions = useChatPreferencesStore((s) => s.setComposerModelOptions)
  const setComposerPlanMode = useChatPreferencesStore((s) => s.setComposerPlanMode)
  const resetComposerFromProvider = useChatPreferencesStore((s) => s.resetComposerFromProvider)
  const ribbonVisible = useSkillCompositionStore((s) => s.ribbonVisible)
  const toggleRibbon = useSkillCompositionStore((s) => s.toggleRibbon)
  const recordUsage = useSkillCompositionStore((s) => s.recordUsage)
  const [value, setValue] = useState(() => (chatId ? getDraft(chatId) : ""))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerPreferencesRef = useRef<ComposerPreferencesHandle>(null)
  const isStandalone = useIsStandalone()
  const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  const composerControlsKey = getComposerControlsKey(chatId, activeProvider)
  const composerAreaId = createUiIdentity("chat.composer", "area")
  const submitActionId = createUiIdentity("chat.composer.submit", "action")
  const cancelActionId = createUiIdentity("chat.composer.cancel", "action")
  const queueActionId = createUiIdentity("chat.composer.queue", "action")
  const composerAreaDescriptor = createUiIdentityDescriptor({
    id: composerAreaId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const submitActionDescriptor = createUiIdentityDescriptor({
    id: submitActionId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const cancelActionDescriptor = createUiIdentityDescriptor({
    id: cancelActionId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })
  const queueActionDescriptor = createUiIdentityDescriptor({
    id: queueActionId,
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  })

  function getComposerSnapshot() {
    return composerPreferencesRef.current?.getSnapshot() ?? resolveComposerPreferences({
      activeProvider,
      composerState,
      providerDefaults,
      lockedOverrides: null,
    })
  }

  function setComposerPlanModeFromComposer(planMode: boolean) {
    composerPreferencesRef.current?.setPlanMode(planMode)
  }

  const autoResize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
    if (element.value.length === 0) {
      element.style.height = ""
      return
    }
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [])

  const setTextareaRefs = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node

    if (!forwardedRef) return
    if (typeof forwardedRef === "function") {
      forwardedRef(node)
      return
    }

    forwardedRef.current = node
  }, [forwardedRef])

  useLayoutEffect(() => {
    autoResize()
  }, [value, autoResize])

  useEffect(() => {
    window.addEventListener("resize", autoResize)
    return () => window.removeEventListener("resize", autoResize)
  }, [autoResize])

  useEffect(() => {
    if (!isTouchDevice) textareaRef.current?.focus()
  }, [chatId, isTouchDevice])

  const resolvedProvider = activeProvider ?? composerState.provider

  function handleSkillInsert(skill: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    const command = formatSkillCommand(skill, resolvedProvider)
    const { value: nextValue, cursorPosition } = computeSkillInsertion(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      command
    )
    setValue(nextValue)
    if (chatId) setDraft(chatId, nextValue)
    recordUsage([skill])
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.selectionStart = cursorPosition
      textarea.selectionEnd = cursorPosition
      autoResize()
    })
  }

  async function handleSubmit() {
    if (!value.trim()) return
    const rawValue = value
    const composerSnapshot = getComposerSnapshot()
    let modelOptions: ModelOptions

    if (composerSnapshot.providerPrefs.provider === "claude") {
      modelOptions = { claude: { ...composerSnapshot.providerPrefs.modelOptions } }
    } else {
      modelOptions = { codex: { ...composerSnapshot.providerPrefs.modelOptions } }
    }
    const submitOptions = {
      provider: composerSnapshot.selectedProvider,
      model: composerSnapshot.providerPrefs.model,
      modelOptions,
      planMode: composerSnapshot.showPlanMode ? composerSnapshot.providerPrefs.planMode : false,
    }
    logChatInput("submit settings", {
      chatId: chatId ?? null,
      activeProvider,
      composerProvider: composerSnapshot.providerPrefs.provider,
      submitOptions,
    })

    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    try {
      const submitResult = await onSubmit(rawValue, submitOptions)
      if (shouldClearDraftAfterSubmit(submitResult)) {
        if (chatId) clearDraft(chatId)
      }
    } catch (error) {
      console.error("[ChatInput] Submit failed:", error)
      setValue(rawValue)
      if (chatId) setDraft(chatId, rawValue)
    }
  }

  function handleRestoreQueuedText() {
    const preservedDraft = chatId ? getDraft(chatId) : ""
    const restored = onRestoreQueuedText?.()
    const nextValue = preservedDraft || restored
    if (!nextValue) return
    setValue(nextValue)
    if (chatId) setDraft(chatId, nextValue)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      autoResize()
    })
  }

  function handleClearQueuedText() {
    onClearQueuedText?.()
    if (chatId) clearDraft(chatId)
  }

  function handleQueueAction() {
    if (getQueueActionDisabledState({ disabled, value })) return
    void handleSubmit()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowUp") {
      const restored = getRestoredQueuedTextOnArrowUp(value, queuedText)
      if (restored) {
        event.preventDefault()
        handleRestoreQueuedText()
        return
      }
    }

    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault()
      focusNextChatInput(textareaRef.current, document)
      return
    }

    if (event.key === "Tab" && event.shiftKey) {
      const composerSnapshot = getComposerSnapshot()
      if (composerSnapshot.showPlanMode) {
        event.preventDefault()
        setComposerPlanModeFromComposer(!composerSnapshot.providerPrefs.planMode)
        return
      }
    }

    if (event.key === "Escape" && canCancel) {
      event.preventDefault()
      onCancel?.()
      return
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !canCancel) {
      event.preventDefault()
      void handleSubmit()
      return
    }

    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0
    if (shouldQueueOnSubmitKeystroke({
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      canCancel,
      isTouchDevice,
    })) {
      event.preventDefault()
      handleQueueAction()
      return
    }

    if (event.key === "Enter" && !event.shiftKey && !canCancel && !isTouchDevice) {
      event.preventDefault()
      void handleSubmit()
    }
  }
  const showQueueAction = shouldShowQueueAction(Boolean(canCancel))
  const queueActionDisabled = getQueueActionDisabledState({ disabled, value })
  return (
    <div>
      {shouldShowQueuedBlock(queuedText) ? (
        <div className={cn("px-3 pb-2", isStandalone && "px-5")}>
          <div className="max-w-[840px] mx-auto rounded-[26px] border border-dashed border-amber-400/50 bg-amber-50/80 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm dark:border-amber-300/30 dark:bg-amber-500/10">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                <ClockPlus className="h-3.5 w-3.5" />
                Queued
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearQueuedText}>
                Clear
              </Button>
            </div>
            <div>{queuedText}</div>
          </div>
        </div>
      ) : null}
      {availableSkills.length > 0 && ribbonVisible ? (
        <div className={cn("px-3", isStandalone && "px-5")}>
          <div className="max-w-[840px] mx-auto">
            <SkillRibbon
              skills={availableSkills}
              provider={resolvedProvider}
              visible={ribbonVisible}
              onToggle={toggleRibbon}
              onInsert={handleSkillInsert}
              showToggle={false}
              contentClassName="pr-0"
            />
          </div>
        </div>
      ) : null}
      <div className={cn("px-3 pt-0", isStandalone && "px-5")}>
        <div
          {...getUiIdentityAttributeProps(composerAreaDescriptor)}
          className="flex items-end gap-2 max-w-[840px] mx-auto border dark:bg-card/40 backdrop-blur-lg border-border rounded-[29px] pr-1.5"
        >
          <Textarea
            ref={setTextareaRefs}
            placeholder="Build something..."
            value={value}
            autoFocus={!isTouchDevice}
            {...{ [CHAT_INPUT_ATTRIBUTE]: "" }}
            rows={1}
            onChange={(event) => {
              setValue(event.target.value)
              if (chatId) setDraft(chatId, event.target.value)
              autoResize()
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="flex-1 text-base p-3 md:p-4 pl-4.5 md:pl-6 resize-none max-h-[200px] outline-none bg-transparent border-0 shadow-none"
          />
          {showQueueAction ? (
            <div className="mb-1 flex items-center gap-2 md:mb-1.5">
              <Button
                {...getUiIdentityAttributeProps(cancelActionDescriptor)}
                type="button"
                aria-label="Stop"
                onPointerDown={(event) => {
                  event.preventDefault()
                  onCancel?.()
                }}
                size="icon"
                className="flex-shrink-0 bg-slate-600 text-white dark:bg-white dark:text-slate-900 rounded-full cursor-pointer h-10 w-10 md:h-11 md:w-11 touch-manipulation"
              >
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-xs bg-current" />
              </Button>
              <Button
                {...getUiIdentityAttributeProps(queueActionDescriptor)}
                type="button"
                aria-label="Queue"
                title="Queue"
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleQueueAction()
                }}
                disabled={queueActionDisabled}
                size="icon"
                className="h-10 w-10 rounded-full md:h-11 md:w-11"
              >
                <ClockPlus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              {...getUiIdentityAttributeProps(submitActionDescriptor)}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault()
                if (!disabled && value.trim()) {
                  void handleSubmit()
                }
              }}
              disabled={disabled || !value.trim()}
              size="icon"
              className="flex-shrink-0 bg-slate-600 text-white dark:bg-white dark:text-slate-900 rounded-full cursor-pointer h-10 w-10 md:h-11 md:w-11 mb-1 -mr-0.5 md:mr-0 md:mb-1.5 touch-manipulation disabled:bg-white/60 disabled:text-slate-700"
            >
              <ArrowUp className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          )}
        </div>
      </div>
      <div className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-3 flex flex-row", isStandalone && "p-5 pt-3")}>
        <div className="min-w-3"/>
        <ComposerPreferenceControls
          key={composerControlsKey}
          ref={composerPreferencesRef}
          activeProvider={activeProvider}
          composerState={composerState}
          providerDefaults={providerDefaults}
          availableProviders={availableProviders}
          availableSkills={availableSkills}
          ribbonVisible={ribbonVisible}
          toggleRibbon={toggleRibbon}
          setComposerModel={setComposerModel}
          setComposerModelOptions={setComposerModelOptions}
          setComposerPlanMode={setComposerPlanMode}
          resetComposerFromProvider={resetComposerFromProvider}
        />
        <div className="min-w-3"/>
      </div>
    </div>
  )
})

export const ChatInput = memo(ChatInputInner)
