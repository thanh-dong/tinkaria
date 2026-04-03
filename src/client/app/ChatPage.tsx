import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { ArrowDown } from "lucide-react"
import { useOutletContext } from "react-router-dom"
import { TinkariaSidebarMark } from "../components/branding/TinkariaSidebarMark"
import { ChatInput } from "../components/chat-ui/ChatInput"
import { ChatNavbar } from "../components/chat-ui/ChatNavbar"
import { RightSidebar } from "../components/chat-ui/RightSidebar"
import { TerminalWorkspace } from "../components/chat-ui/TerminalWorkspace"
import { LocalFilePreviewDialog } from "../components/messages/LocalFilePreviewDialog"
import { ProcessingMessage } from "../components/messages/ProcessingMessage"
import { Card, CardContent } from "../components/ui/card"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable"
import { ScrollArea } from "../components/ui/scroll-area"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import { actionMatchesEvent, getResolvedKeybindings } from "../lib/keybindings"
import { cn } from "../lib/utils"
import {
  DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT,
  RIGHT_SIDEBAR_MAX_SIZE_PERCENT,
  RIGHT_SIDEBAR_MIN_SIZE_PERCENT,
  useRightSidebarStore,
} from "../stores/rightSidebarStore"
import { DEFAULT_PROJECT_TERMINAL_LAYOUT, useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"
import { shouldCloseTerminalPane } from "./terminalLayoutResize"
import { TERMINAL_TOGGLE_ANIMATION_DURATION_MS } from "./terminalToggleAnimation"
import { useRightSidebarToggleAnimation } from "./useRightSidebarToggleAnimation"
import { useTerminalToggleAnimation } from "./useTerminalToggleAnimation"
import type { TinkariaState } from "./useTinkariaState"
import { TinkariaTranscript } from "./TinkariaTranscript"
import { useStickyChatFocus } from "./useStickyChatFocus"
import type { HydratedTranscriptMessage } from "../../shared/types"

const EMPTY_STATE_TEXT = "What are we building?"
const EMPTY_STATE_TYPING_INTERVAL_MS = 19
const CHAT_NAVBAR_OFFSET_PX = 72
const SCROLL_BUTTON_BOTTOM_PX = 120
const MOBILE_SIDEBAR_SWIPE_EDGE_PX = 32
const MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE_PX = 72
const MOBILE_SIDEBAR_SWIPE_MAX_VERTICAL_DRIFT_PX = 56
const CHAT_PAGE_UI_IDENTITIES = {
  page: "chat.page",
  transcript: "transcript.message-list",
  composer: "chat.composer",
  navbar: "chat.navbar",
} as const

const MOBILE_SIDEBAR_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "label",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[data-no-sidebar-swipe]",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[role='textbox']",
].join(",")

interface MobileSidebarSwipeDecisionArgs {
  startX: number
  startY: number
  currentX: number
  currentY: number
  isMobileViewport: boolean
  isSidebarOpen: boolean
  target: EventTarget | null
}

interface MobileSidebarSwipeState {
  pointerId: number
  startX: number
  startY: number
  target: EventTarget | null
}

function getSkillsFromDebugRaw(debugRaw?: string): string[] | null {
  if (!debugRaw) return null
  try {
    const parsed = JSON.parse(debugRaw) as { skills?: unknown }
    if (!Array.isArray(parsed.skills)) return null
    const result: string[] = []
    const seen = new Set<string>()
    for (const skill of parsed.skills) {
      if (typeof skill !== "string") continue
      const trimmed = skill.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      result.push(trimmed)
    }
    return result.length > 0 ? result : null
  } catch {
    return null
  }
}

export function getAvailableSkillsFromMessages(messages: HydratedTranscriptMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.kind !== "system_init") continue
    // Prefer skills from debug payload, fall back to slashCommands
    return getSkillsFromDebugRaw(message.debugRaw) ?? message.slashCommands
  }
  return []
}

export function shouldIgnoreMobileSidebarSwipeStart(target: EventTarget | null): boolean {
  if (typeof target !== "object" || target === null || !("closest" in target)) {
    return false
  }

  const candidate = target as { closest?: (selector: string) => unknown }
  return typeof candidate.closest === "function"
    && candidate.closest(MOBILE_SIDEBAR_INTERACTIVE_SELECTOR) !== null
}

export function shouldOpenMobileSidebarFromSwipe(args: MobileSidebarSwipeDecisionArgs): boolean {
  if (!args.isMobileViewport || args.isSidebarOpen) {
    return false
  }

  if (shouldIgnoreMobileSidebarSwipeStart(args.target)) {
    return false
  }

  if (args.startX > MOBILE_SIDEBAR_SWIPE_EDGE_PX) {
    return false
  }

  const deltaX = args.currentX - args.startX
  const deltaY = Math.abs(args.currentY - args.startY)
  if (deltaX < MOBILE_SIDEBAR_SWIPE_MIN_DISTANCE_PX) {
    return false
  }

  if (deltaY > MOBILE_SIDEBAR_SWIPE_MAX_VERTICAL_DRIFT_PX) {
    return false
  }

  return deltaX > deltaY
}

export function getEmptyStateTypingDurationMs(text: string): number {
  return text.length * EMPTY_STATE_TYPING_INTERVAL_MS
}

export function getChatPageUiIdentities() {
  return CHAT_PAGE_UI_IDENTITIES
}

export function ChatEmptyStateBrandMark() {
  return (
    <TinkariaSidebarMark
      className="size-8 border-slate-300/60 bg-white/55 p-[3px] text-muted-foreground tinkaria-empty-state-flower dark:border-white/10 dark:bg-white/[0.02]"
      imageClassName="size-full"
    />
  )
}

export function ChatPage() {
  const state = useOutletContext<TinkariaState>()
  const layoutRootRef = useRef<HTMLDivElement>(null)
  const chatCardRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const mobileSidebarSwipeRef = useRef<MobileSidebarSwipeState | null>(null)
  const [fixedTerminalHeight, setFixedTerminalHeight] = useState(0)
  const projectId = state.runtime?.projectId ?? null
  const projectTerminalLayout = useTerminalLayoutStore((store) => (projectId ? store.projects[projectId] : undefined))
  const terminalLayout = projectTerminalLayout ?? DEFAULT_PROJECT_TERMINAL_LAYOUT
  const projectRightSidebarLayout = useRightSidebarStore((store) => (projectId ? store.projects[projectId] : undefined))
  const rightSidebarLayout = projectRightSidebarLayout ?? DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT
  const addTerminal = useTerminalLayoutStore((store) => store.addTerminal)
  const removeTerminal = useTerminalLayoutStore((store) => store.removeTerminal)
  const toggleVisibility = useTerminalLayoutStore((store) => store.toggleVisibility)
  const resetMainSizes = useTerminalLayoutStore((store) => store.resetMainSizes)
  const setMainSizes = useTerminalLayoutStore((store) => store.setMainSizes)
  const setTerminalSizes = useTerminalLayoutStore((store) => store.setTerminalSizes)
  const toggleRightSidebar = useRightSidebarStore((store) => store.toggleVisibility)
  const setRightSidebarSize = useRightSidebarStore((store) => store.setSize)
  const scrollback = useTerminalPreferencesStore((store) => store.scrollbackLines)
  const minColumnWidth = useTerminalPreferencesStore((store) => store.minColumnWidth)
  const keybindings = state.keybindings
  const resolvedKeybindings = useMemo(() => getResolvedKeybindings(keybindings), [keybindings])
  const uiIdentities = getChatPageUiIdentities()

  const availableSkills = useMemo(() => getAvailableSkillsFromMessages(state.messages), [state.messages])

  const hasTerminals = terminalLayout.terminals.length > 0
  const showTerminalPane = Boolean(projectId && terminalLayout.isVisible && hasTerminals)
  const shouldRenderTerminalLayout = Boolean(projectId && hasTerminals)
  const showRightSidebar = Boolean(projectId && rightSidebarLayout.isVisible)
  const shouldRenderRightSidebarLayout = Boolean(projectId)
  const {
    isAnimating: isTerminalAnimating,
    mainPanelGroupRef,
    terminalFocusRequestVersion,
    terminalPanelRef,
    terminalVisualRef,
  } = useTerminalToggleAnimation({
    showTerminalPane,
    shouldRenderTerminalLayout,
    projectId,
    terminalLayout,
    chatInputRef,
  })
  const {
    isAnimating: isRightSidebarAnimating,
    panelGroupRef: rightSidebarPanelGroupRef,
    sidebarPanelRef,
    sidebarVisualRef,
  } = useRightSidebarToggleAnimation({
    projectId,
    shouldRenderRightSidebarLayout,
    showRightSidebar,
    rightSidebarSize: rightSidebarLayout.size,
  })

  useStickyChatFocus({
    rootRef: chatCardRef,
    fallbackRef: chatInputRef,
    enabled: state.hasSelectedProject && state.runtime?.status !== "waiting_for_user",
    canCancel: state.canCancel,
  })

  const handleToggleEmbeddedTerminal = () => {
    if (!projectId) return
    if (hasTerminals) {
      toggleVisibility(projectId)
      return
    }

    addTerminal(projectId)
  }

  const handleTerminalResize = (layout: Record<string, number>) => {
    if (!projectId || !showTerminalPane || isTerminalAnimating.current) {
      return
    }

    const chatSize = layout.chat
    const terminalSize = layout.terminal
    if (!Number.isFinite(chatSize) || !Number.isFinite(terminalSize)) {
      return
    }

    const containerHeight = layoutRootRef.current?.getBoundingClientRect().height ?? 0
    if (shouldCloseTerminalPane(containerHeight, terminalSize)) {
      resetMainSizes(projectId)
      toggleVisibility(projectId)
      return
    }

    setMainSizes(projectId, [chatSize, terminalSize])
  }

  const handleMobileSidebarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") {
      mobileSidebarSwipeRef.current = null
      return
    }

    mobileSidebarSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.target,
    }
  }

  const handleMobileSidebarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = mobileSidebarSwipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) {
      return
    }

    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches
    if (!shouldOpenMobileSidebarFromSwipe({
      startX: swipe.startX,
      startY: swipe.startY,
      currentX: event.clientX,
      currentY: event.clientY,
      isMobileViewport,
      isSidebarOpen: state.sidebarOpen,
      target: swipe.target,
    })) {
      return
    }

    mobileSidebarSwipeRef.current = null
    state.openSidebar()
  }

  const handleMobileSidebarPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mobileSidebarSwipeRef.current?.pointerId === event.pointerId) {
      mobileSidebarSwipeRef.current = null
    }
  }

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      if (!projectId) return
      if (actionMatchesEvent(resolvedKeybindings, "toggleEmbeddedTerminal", event)) {
        event.preventDefault()
        handleToggleEmbeddedTerminal()
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "toggleRightSidebar", event)) {
        event.preventDefault()
        toggleRightSidebar(projectId)
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "openInFinder", event)) {
        event.preventDefault()
        void state.handleOpenExternal("open_finder")
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "openInEditor", event)) {
        event.preventDefault()
        void state.handleOpenExternal("open_editor")
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "addSplitTerminal", event)) {
        event.preventDefault()
        addTerminal(projectId)
      }
    }

    window.addEventListener("keydown", handleGlobalKeydown)
    return () => window.removeEventListener("keydown", handleGlobalKeydown)
  }, [addTerminal, handleToggleEmbeddedTerminal, projectId, resolvedKeybindings, toggleRightSidebar, toggleVisibility])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      state.updateScrollState()
    })
    const timeoutId = window.setTimeout(() => {
      state.updateScrollState()
    }, TERMINAL_TOGGLE_ANIMATION_DURATION_MS)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [shouldRenderTerminalLayout, showTerminalPane, state.updateScrollState])

  useEffect(() => {
    function handleResize() {
      state.updateScrollState()
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [state.updateScrollState])

  useEffect(() => {
    const element = layoutRootRef.current
    if (!element || !shouldRenderTerminalLayout) return

    const updateHeight = () => {
      const containerHeight = element.getBoundingClientRect().height
      if (containerHeight <= 0) return
      const nextHeight = containerHeight * (terminalLayout.mainSizes[1] / 100)
      if (nextHeight <= 0) return
      setFixedTerminalHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight))
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    updateHeight()

    return () => observer.disconnect()
  }, [projectId, shouldRenderTerminalLayout, terminalLayout.mainSizes])

  const clampRightSidebarSize = (size: number) => {
    if (!Number.isFinite(size)) {
      return rightSidebarLayout.size
    }

    return Math.min(RIGHT_SIDEBAR_MAX_SIZE_PERCENT, Math.max(RIGHT_SIDEBAR_MIN_SIZE_PERCENT, size))
  }

  const chatCard = (
    <Card ref={chatCardRef} className="bg-background h-full flex flex-col overflow-hidden border-0 rounded-none relative">
      <CardContent className="flex flex-1 min-h-0 flex-col p-0 overflow-hidden relative">
        <LocalFilePreviewDialog
          preview={state.localFilePreview}
          onClose={state.closeLocalFilePreview}
          onOpenLocalLink={(target) => {
            void state.handleOpenLocalLink(target)
          }}
        />

        <ChatNavbar
          sidebarCollapsed={state.sidebarCollapsed}
          onOpenSidebar={state.openSidebar}
          onCollapseSidebar={state.collapseSidebar}
          onExpandSidebar={state.expandSidebar}
          onNewChat={state.handleCompose}
          localPath={state.navbarLocalPath}
          embeddedTerminalVisible={showTerminalPane}
          onToggleEmbeddedTerminal={projectId ? handleToggleEmbeddedTerminal : undefined}
          rightSidebarVisible={showRightSidebar}
          onToggleRightSidebar={projectId ? () => toggleRightSidebar(projectId) : undefined}
          onOpenExternal={(action) => {
            void state.handleOpenExternal(action)
          }}
          editorLabel={state.editorLabel}
          finderShortcut={resolvedKeybindings.bindings.openInFinder}
          editorShortcut={resolvedKeybindings.bindings.openInEditor}
          terminalShortcut={resolvedKeybindings.bindings.toggleEmbeddedTerminal}
          rightSidebarShortcut={resolvedKeybindings.bindings.toggleRightSidebar}
        />

        <div className="flex-1 min-h-0" {...getUiIdentityAttributeProps(uiIdentities.transcript)}>
          <ScrollArea
            ref={state.scrollRef}
            onScroll={state.updateScrollState}
            className="h-full px-4 scroll-pt-[72px]"
          >
            {state.messages.length === 0 ? <div style={{ height: state.transcriptPaddingBottom }} aria-hidden="true" /> : null}
            {state.messages.length > 0 ? (
              <>
                <div className="animate-fade-in space-y-5 pt-[72px] max-w-[800px] mx-auto">
                  <TinkariaTranscript
                    messages={state.messages}
                    scrollRef={state.scrollRef}
                    isLoading={state.isProcessing}
                    localPath={state.runtime?.localPath}
                    latestToolIds={state.latestToolIds}
                    onOpenLocalLink={state.handleOpenLocalLink}
                    onOpenExternalLink={state.handleOpenExternalLink}
                    onAskUserQuestionSubmit={state.handleAskUserQuestion}
                    onExitPlanModeConfirm={state.handleExitPlanMode}
                  />
                  {state.isProcessing ? <ProcessingMessage status={state.runtime?.status} /> : null}
                  {state.commandError ? (
                    <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3">
                      {state.commandError}
                    </div>
                  ) : null}
                </div>
                <div style={{ height: 250 }} aria-hidden="true" />
              </>
            ) : null}
          </ScrollArea>
        </div>

        {state.messages.length === 0 ? (
          <div
            key={state.activeChatId ?? "new-chat"}
            className="pointer-events-none absolute inset-x-4 animate-fade-in"
            style={{
              top: CHAT_NAVBAR_OFFSET_PX,
              bottom: state.transcriptPaddingBottom,
            }}
          >
            <div className="mx-auto flex h-full max-w-[800px] items-center justify-center">
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-70">
                <ChatEmptyStateBrandMark />
                <div
                  className="text-base font-normal text-muted-foreground text-center max-w-xs flex items-center tinkaria-empty-state-text"
                  aria-label={EMPTY_STATE_TEXT}
                >
                  <span className="relative inline-grid place-items-start">
                    <span className="invisible col-start-1 row-start-1 whitespace-pre flex items-center">
                      <span>{EMPTY_STATE_TEXT}</span>
                      <span className="tinkaria-typewriter-cursor-slot" aria-hidden="true" />
                    </span>
                    <span className="col-start-1 row-start-1 whitespace-pre flex items-center">
                      <span
                        className="tinkaria-typewriter-text"
                        style={{
                          "--tinkaria-typewriter-duration-ms": `${getEmptyStateTypingDurationMs(EMPTY_STATE_TEXT)}ms`,
                          "--tinkaria-typewriter-steps": EMPTY_STATE_TEXT.length,
                        } as CSSProperties}
                      >
                        {EMPTY_STATE_TEXT}
                      </span>
                      <span className="tinkaria-typewriter-cursor-slot" aria-hidden="true">
                        <span
                          className="tinkaria-typewriter-cursor"
                          style={{
                            "--tinkaria-typewriter-duration-ms": `${getEmptyStateTypingDurationMs(EMPTY_STATE_TEXT)}ms`,
                          } as CSSProperties}
                        />
                      </span>
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div
          style={{ bottom: SCROLL_BUTTON_BOTTOM_PX }}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-10 transition-all",
            state.showScrollButton
              ? "scale-100 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              : "scale-60 duration-300 ease-out pointer-events-none blur-sm opacity-0"
          )}
        >
          <button
            onClick={state.scrollToBottom}
            className="flex items-center transition-colors gap-1.5 px-2 bg-white hover:bg-muted border border-border rounded-full aspect-square cursor-pointer text-sm text-primary hover:text-foreground dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 dark:border-slate-600"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>
      </CardContent>

      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        {...getUiIdentityAttributeProps(uiIdentities.composer)}
      >
        <div className="bg-gradient-to-t from-background via-background pointer-events-auto" ref={state.inputRef}>
          <ChatInput
            ref={chatInputRef}
            key={state.activeChatId ?? "new-chat"}
            onSubmit={state.handleSubmitFromComposer}
            onCancel={() => {
              void state.handleCancel()
            }}
            queuedText={state.queuedText}
            onClearQueuedText={state.clearQueuedText}
            onRestoreQueuedText={state.restoreQueuedText}
            disabled={!state.hasSelectedProject || state.runtime?.status === "waiting_for_user"}
            canCancel={state.canCancel}
            chatId={state.activeChatId}
            activeProvider={state.runtime?.provider ?? null}
            availableProviders={state.availableProviders}
            availableSkills={availableSkills}
          />
        </div>
      </div>
    </Card>
  )

  return (
    <div
      ref={layoutRootRef}
      className="flex-1 flex flex-col min-w-0 relative"
      onPointerDown={handleMobileSidebarPointerDown}
      onPointerMove={handleMobileSidebarPointerMove}
      onPointerUp={handleMobileSidebarPointerEnd}
      onPointerCancel={handleMobileSidebarPointerEnd}
      {...getUiIdentityAttributeProps(uiIdentities.page)}
    >
      {shouldRenderRightSidebarLayout && projectId ? (
        <ResizablePanelGroup
          key={`${projectId}-right-sidebar`}
          groupRef={rightSidebarPanelGroupRef}
          orientation="horizontal"
          className="flex-1 min-h-0"
          onLayoutChange={(layout) => {
            if (!showRightSidebar || isRightSidebarAnimating.current) {
              return
            }

            const clampedRightSidebarSize = clampRightSidebarSize(layout.rightSidebar)
            if (Math.abs(clampedRightSidebarSize - layout.rightSidebar) < 0.1) {
              return
            }

            rightSidebarPanelGroupRef.current?.setLayout({
              workspace: 100 - clampedRightSidebarSize,
              rightSidebar: clampedRightSidebarSize,
            })
          }}
          onLayoutChanged={(layout) => {
            if (!showRightSidebar || isRightSidebarAnimating.current) {
              return
            }

            setRightSidebarSize(projectId, clampRightSidebarSize(layout.rightSidebar))
          }}
        >
          <ResizablePanel
            id="workspace"
            defaultSize={`${100 - rightSidebarLayout.size}%`}
            minSize="50%"
            className="min-h-0 min-w-0"
          >
            {shouldRenderTerminalLayout ? (
              <ResizablePanelGroup
                key={projectId}
                groupRef={mainPanelGroupRef}
                orientation="vertical"
                className="flex-1 min-h-0"
                onLayoutChanged={handleTerminalResize}
              >
                <ResizablePanel id="chat" defaultSize={`${terminalLayout.mainSizes[0]}%`} minSize="25%" className="min-h-0">
                  {chatCard}
                </ResizablePanel>
                <ResizableHandle
                  withHandle
                  orientation="vertical"
                  disabled={!showTerminalPane}
                  className={cn(!showTerminalPane && "pointer-events-none opacity-0")}
                />
                <ResizablePanel
                  id="terminal"
                  defaultSize={`${terminalLayout.mainSizes[1]}%`}
                  minSize="0%"
                  className="min-h-0"
                  elementRef={terminalPanelRef}
                >
                  <div
                    ref={terminalVisualRef}
                    className="h-full min-h-0 overflow-hidden relative"
                    data-terminal-open={showTerminalPane ? "true" : "false"}
                    data-terminal-animated="false"
                    data-terminal-visual
                    style={{
                      "--terminal-toggle-duration": `${TERMINAL_TOGGLE_ANIMATION_DURATION_MS}ms`,
                    } as CSSProperties}
                  >
                    <div style={fixedTerminalHeight > 0 ? { height: `${fixedTerminalHeight}px` } : undefined}>
                      <TerminalWorkspace
                        projectId={projectId}
                        layout={terminalLayout}
                        onAddTerminal={addTerminal}
                        socket={state.socket}
                        connectionStatus={state.connectionStatus}
                        scrollback={scrollback}
                        minColumnWidth={minColumnWidth}
                        splitTerminalShortcut={resolvedKeybindings.bindings.addSplitTerminal}
                        focusRequestVersion={terminalFocusRequestVersion}
                        onRemoveTerminal={(currentProjectId, terminalId) => {
                          void state.socket.command({ type: "terminal.close", terminalId }).catch(() => {})
                          removeTerminal(currentProjectId, terminalId)
                        }}
                        onTerminalLayout={setTerminalSizes}
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              chatCard
            )}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            orientation="horizontal"
            disabled={!showRightSidebar}
            className={cn(!showRightSidebar && "pointer-events-none opacity-0")}
          />
          <ResizablePanel
            id="rightSidebar"
            defaultSize={`${rightSidebarLayout.size}%`}
            maxSize={`${RIGHT_SIDEBAR_MAX_SIZE_PERCENT}%`}
            className="min-h-0 min-w-0"
            elementRef={sidebarPanelRef}
          >
            <div
              ref={sidebarVisualRef}
              className="h-full min-h-0 overflow-hidden"
              data-right-sidebar-open={showRightSidebar ? "true" : "false"}
              data-right-sidebar-animated="false"
              data-right-sidebar-visual
              style={{
                "--terminal-toggle-duration": `${TERMINAL_TOGGLE_ANIMATION_DURATION_MS}ms`,
              } as CSSProperties}
            >
              <RightSidebar
                onClose={() => toggleRightSidebar(projectId)}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : shouldRenderTerminalLayout && projectId ? (
        <ResizablePanelGroup
          key={projectId}
          groupRef={mainPanelGroupRef}
          orientation="vertical"
          className="flex-1 min-h-0"
          onLayoutChanged={handleTerminalResize}
        >
          <ResizablePanel id="chat" defaultSize={`${terminalLayout.mainSizes[0]}%`} minSize="25%" className="min-h-0">
            {chatCard}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            orientation="vertical"
            disabled={!showTerminalPane}
            className={cn(!showTerminalPane && "pointer-events-none opacity-0")}
          />
          <ResizablePanel
            id="terminal"
            defaultSize={`${terminalLayout.mainSizes[1]}%`}
            minSize="0%"
            className="min-h-0"
            elementRef={terminalPanelRef}
          >
            <div
              ref={terminalVisualRef}
              className="h-full min-h-0 overflow-hidden relative"
              data-terminal-open={showTerminalPane ? "true" : "false"}
              data-terminal-animated="false"
              data-terminal-visual
              style={{
                "--terminal-toggle-duration": `${TERMINAL_TOGGLE_ANIMATION_DURATION_MS}ms`,
              } as CSSProperties}
            >
              <div style={fixedTerminalHeight > 0 ? { height: `${fixedTerminalHeight}px` } : undefined}>
                <TerminalWorkspace
                  projectId={projectId}
                  layout={terminalLayout}
                  onAddTerminal={addTerminal}
                  socket={state.socket}
                  connectionStatus={state.connectionStatus}
                  scrollback={scrollback}
                  minColumnWidth={minColumnWidth}
                  splitTerminalShortcut={resolvedKeybindings.bindings.addSplitTerminal}
                  focusRequestVersion={terminalFocusRequestVersion}
                  onRemoveTerminal={(currentProjectId, terminalId) => {
                    void state.socket.command({ type: "terminal.close", terminalId }).catch(() => {})
                    removeTerminal(currentProjectId, terminalId)
                  }}
                  onTerminalLayout={setTerminalSizes}
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        chatCard
      )}

    </div>
  )
}
