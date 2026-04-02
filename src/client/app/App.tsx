import { useEffect, useMemo, useRef, useState } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import {
  buildUiIdentityStack,
  isUiIdentityOverlayActive,
  UI_IDENTITY_ATTRIBUTE,
  type UiIdentityModifierState,
} from "../lib/uiIdentityOverlay"
import { AppDialogProvider } from "../components/ui/app-dialog"
import {
  UiIdentityOverlay,
  UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE,
  type UiIdentityOverlayAnchorRect,
} from "../components/ui/UiIdentityOverlay"
import { TooltipProvider } from "../components/ui/tooltip"
import { SDK_CLIENT_APP } from "../../shared/branding"
import { TinkariaSidebar } from "./TinkariaSidebar"
import { ChatPage } from "./ChatPage"
import { LocalProjectsPage } from "./LocalProjectsPage"
import { SettingsPage } from "./SettingsPage"
import { useTinkariaState } from "./useTinkariaState"

const VERSION_SEEN_STORAGE_KEY = "kanna:last-seen-version"
const UI_IDENTITY_OVERLAY_COPY_DURATION_MS = 1200
const UI_IDENTITY_OVERLAY_POINTER_HANDOFF_DELAY_MS = 320

export function shouldRedirectToChangelog(pathname: string, currentVersion: string, seenVersion: string | null) {
  return pathname === "/" && Boolean(currentVersion) && seenVersion !== currentVersion
}

export function getUiIdentityOverlayCopyDurationMs() {
  return UI_IDENTITY_OVERLAY_COPY_DURATION_MS
}

export function getUiIdentityOverlayPointerHandoffDelayMs() {
  return UI_IDENTITY_OVERLAY_POINTER_HANDOFF_DELAY_MS
}

export function getGlobalUiIdentityIds() {
  return {
    sidebar: "chat.sidebar",
    terminal: "chat.terminal-workspace",
    rightSidebar: "chat.right-sidebar",
    settings: "settings.page",
    chatRow: "sidebar.chat-row",
    projectGroup: "sidebar.project-group",
    chatRowMenu: "sidebar.chat-row.menu",
    projectGroupMenu: "sidebar.project-group.menu",
  }
}

type UiIdentityOverlayKeyboardEvent = Pick<KeyboardEvent, "altKey" | "shiftKey">
type UiIdentityOverlayPointerEvent = Pick<PointerEvent, "target" | "clientX" | "clientY">
type UiIdentityOverlayWindowLike = Pick<Window, "addEventListener" | "removeEventListener">

interface UiIdentityOverlayPointerPosition {
  clientX: number
  clientY: number
}

interface UiIdentityOverlayWindowHandlers {
  setModifiers: (modifiers: UiIdentityModifierState) => void
  setPointerTarget: (target: Element | null) => void
  setPointerPosition: (position: UiIdentityOverlayPointerPosition) => void
  resetHighlight: () => void
  cancelPendingPointerClear: () => void
  clearPointerTargetWithDelay: () => void
}

function hasClosest(target: EventTarget | null): target is EventTarget & { closest: (selector: string) => unknown } {
  return typeof (target as { closest?: unknown } | null)?.closest === "function"
}

function isUiIdentityOverlayElement(target: EventTarget | null): target is Element {
  return typeof (target as { getAttribute?: unknown } | null)?.getAttribute === "function"
}

function isUiIdentityOverlayKeyboardEvent(event: Event): event is Event & UiIdentityOverlayKeyboardEvent {
  return typeof (event as Partial<UiIdentityOverlayKeyboardEvent>).altKey === "boolean"
    && typeof (event as Partial<UiIdentityOverlayKeyboardEvent>).shiftKey === "boolean"
}

function isUiIdentityOverlayPointerEvent(event: Event): event is Event & UiIdentityOverlayPointerEvent {
  return typeof (event as Partial<UiIdentityOverlayPointerEvent>).clientX === "number"
    && typeof (event as Partial<UiIdentityOverlayPointerEvent>).clientY === "number"
}

export function shouldIgnoreUiIdentityOverlayPointerTarget(target: EventTarget | null): boolean {
  if (!hasClosest(target)) {
    return false
  }

  return Boolean(target.closest(`[${UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE}="true"]`))
}

function createUiIdentityOverlayInactiveModifiers(): UiIdentityModifierState {
  return { altKey: false, shiftKey: false }
}

function getUiIdentityOverlayModifiers(event: UiIdentityOverlayKeyboardEvent): UiIdentityModifierState {
  return { altKey: event.altKey, shiftKey: event.shiftKey }
}

function getUiIdentityOverlayPointerTarget(target: EventTarget | null): Element | null {
  if (!isUiIdentityOverlayElement(target)) {
    return null
  }

  return target
}

export function bindUiIdentityOverlayWindowEvents(
  windowLike: UiIdentityOverlayWindowLike,
  handlers: UiIdentityOverlayWindowHandlers,
) {
  function handleKeyChange(event: Event) {
    if (!isUiIdentityOverlayKeyboardEvent(event)) return
    handlers.setModifiers(getUiIdentityOverlayModifiers(event))
  }

  function handleWindowBlur() {
    handlers.setModifiers(createUiIdentityOverlayInactiveModifiers())
  }

  function handlePointerMove(event: Event) {
    if (!isUiIdentityOverlayPointerEvent(event)) return

    const target = event.target ?? null
    if (shouldIgnoreUiIdentityOverlayPointerTarget(target)) {
      handlers.cancelPendingPointerClear()
      return
    }

    handlers.setPointerPosition({
      clientX: event.clientX,
      clientY: event.clientY,
    })

    const pointerTarget = getUiIdentityOverlayPointerTarget(target)
    if (buildUiIdentityStack(pointerTarget, 1).length === 0) {
      handlers.clearPointerTargetWithDelay()
      return
    }

    handlers.cancelPendingPointerClear()
    handlers.setPointerTarget(pointerTarget)
    handlers.resetHighlight()
  }

  windowLike.addEventListener("keydown", handleKeyChange)
  windowLike.addEventListener("keyup", handleKeyChange)
  windowLike.addEventListener("blur", handleWindowBlur)
  windowLike.addEventListener("pointermove", handlePointerMove)

  return () => {
    windowLike.removeEventListener("keydown", handleKeyChange)
    windowLike.removeEventListener("keyup", handleKeyChange)
    windowLike.removeEventListener("blur", handleWindowBlur)
    windowLike.removeEventListener("pointermove", handlePointerMove)
  }
}

function hasBoundingClientRect(
  element: Element | null,
): element is Element & { getBoundingClientRect: () => UiIdentityOverlayAnchorRect } {
  return typeof element?.getBoundingClientRect === "function"
}

export function getUiIdentityOverlayHighlightRect(
  stack: Element[],
  highlightedId: string | null,
): UiIdentityOverlayAnchorRect | null {
  const highlightedElement =
    stack.find((element) => element.getAttribute(UI_IDENTITY_ATTRIBUTE) === highlightedId) ?? stack[0] ?? null

  return hasBoundingClientRect(highlightedElement) ? highlightedElement.getBoundingClientRect() : null
}

export function getUiIdentityOverlayAnchorRect(
  pointerPosition: UiIdentityOverlayPointerPosition | null,
): UiIdentityOverlayAnchorRect | null {
  if (!pointerPosition) {
    return null
  }

  return {
    top: pointerPosition.clientY,
    left: pointerPosition.clientX,
    right: pointerPosition.clientX,
    bottom: pointerPosition.clientY,
    width: 0,
    height: 0,
  }
}

async function copyUiIdentityToClipboard(id: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard
  if (!clipboard?.writeText) {
    return false
  }

  return clipboard.writeText(id).then(
    () => true,
    () => false,
  )
}

function UiIdentityOverlayController() {
  const [modifiers, setModifiers] = useState<UiIdentityModifierState>(createUiIdentityOverlayInactiveModifiers)
  const [pointerTarget, setPointerTarget] = useState<Element | null>(null)
  const [pointerPosition, setPointerPosition] = useState<UiIdentityOverlayPointerPosition | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)

  const stack = useMemo(() => buildUiIdentityStack(pointerTarget, 3), [pointerTarget])
  const active = isUiIdentityOverlayActive(modifiers)
  activeRef.current = active
  const anchorRect = useMemo<UiIdentityOverlayAnchorRect | null>(
    () => getUiIdentityOverlayAnchorRect(pointerPosition),
    [pointerPosition]
  )
  const effectiveHighlightedId = highlightedId ?? stack[0]?.getAttribute(UI_IDENTITY_ATTRIBUTE) ?? null
  const highlightRect = useMemo(
    () => getUiIdentityOverlayHighlightRect(stack, highlightedId),
    [highlightedId, stack]
  )

  useEffect(() => {
    return bindUiIdentityOverlayWindowEvents(window, {
      setModifiers,
      setPointerTarget,
      setPointerPosition,
      resetHighlight: () => {
        setHighlightedId(null)
      },
      cancelPendingPointerClear: () => {
        if (pointerClearTimeoutRef.current !== null) {
          clearTimeout(pointerClearTimeoutRef.current)
          pointerClearTimeoutRef.current = null
        }
      },
      clearPointerTargetWithDelay: () => {
        if (!activeRef.current) {
          setPointerTarget(null)
          setHighlightedId(null)
          return
        }
        if (pointerClearTimeoutRef.current !== null) {
          return
        }
        pointerClearTimeoutRef.current = setTimeout(() => {
          setPointerTarget(null)
          setHighlightedId(null)
          pointerClearTimeoutRef.current = null
        }, UI_IDENTITY_OVERLAY_POINTER_HANDOFF_DELAY_MS)
      },
    })
  }, [])

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
      }
      if (pointerClearTimeoutRef.current !== null) {
        clearTimeout(pointerClearTimeoutRef.current)
      }
    }
  }, [])

  function handleCopy(id: string) {
    void copyUiIdentityToClipboard(id).then((didCopy) => {
      if (!didCopy) {
        return
      }

      setCopiedId(id)
      if (copiedTimeoutRef.current !== null) {
        clearTimeout(copiedTimeoutRef.current)
      }
      copiedTimeoutRef.current = setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current))
        copiedTimeoutRef.current = null
      }, UI_IDENTITY_OVERLAY_COPY_DURATION_MS)
    })
  }

  return (
    <UiIdentityOverlay
      active={active}
      anchorRect={anchorRect}
      highlightRect={active ? highlightRect : null}
      stack={active ? stack : []}
      highlightedId={active ? effectiveHighlightedId : null}
      copiedId={copiedId}
      onCopy={handleCopy}
      onHighlight={setHighlightedId}
    />
  )
}

function TinkariaLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const state = useTinkariaState(params.chatId ?? null)
  const showMobileOpenButton = location.pathname === "/"
  const currentVersion = SDK_CLIENT_APP.split("/")[1] ?? "unknown"

  useEffect(() => {
    const seenVersion = window.localStorage.getItem(VERSION_SEEN_STORAGE_KEY)
    const shouldRedirect = shouldRedirectToChangelog(location.pathname, currentVersion, seenVersion)
    window.localStorage.setItem(VERSION_SEEN_STORAGE_KEY, currentVersion)
    if (!shouldRedirect) return
    navigate("/settings/changelog", { replace: true })
  }, [currentVersion, location.pathname, navigate])

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden">
      <TinkariaSidebar
        data={state.sidebarData}
        activeChatId={state.activeChatId}
        connectionStatus={state.connectionStatus}
        ready={state.sidebarReady}
        open={state.sidebarOpen}
        collapsed={state.sidebarCollapsed}
        showMobileOpenButton={showMobileOpenButton}
        onOpen={state.openSidebar}
        onClose={state.closeSidebar}
        onCollapse={state.collapseSidebar}
        onExpand={state.expandSidebar}
        onCreateChat={(projectId) => {
          void state.handleCreateChat(projectId)
        }}
        onDeleteChat={(chat) => {
          void state.handleDeleteChat(chat)
        }}
        onRenameChat={(chatId, title) => {
          void state.handleRenameChat(chatId, title)
        }}
        onRemoveProject={(projectId) => {
          void state.handleRemoveProject(projectId)
        }}
        updateSnapshot={state.updateSnapshot}
        onInstallUpdate={() => {
          void state.handleInstallUpdate()
        }}
        sessionsForProject={(projectId) =>
          state.sessionsSnapshots.get(projectId)?.sessions ?? []
        }
        sessionsWindowDaysForProject={(projectId) =>
          state.sessionsWindowDays.get(projectId) ?? 7
        }
        onOpenSessionPicker={state.handleOpenSessionPicker}
        onResumeSession={(projectId, sessionId, provider) => {
          void state.handleResumeSession(projectId, sessionId, provider)
        }}
        onRefreshSessions={state.handleRefreshSessions}
        onShowMoreSessions={state.handleShowMoreSessions}
      />
      <Outlet context={state} />
    </div>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <UiIdentityOverlayController />
      <AppDialogProvider>
        <Routes>
          <Route element={<TinkariaLayout />}>
            <Route path="/" element={<LocalProjectsPage />} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:sectionId" element={<SettingsPage />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
          </Route>
        </Routes>
      </AppDialogProvider>
    </TooltipProvider>
  )
}
