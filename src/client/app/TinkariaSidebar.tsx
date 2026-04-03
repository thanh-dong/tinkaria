import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"
import { Grip, Loader2, Maximize2, Menu, PanelLeft, Plus, Settings, X } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import { Button } from "../components/ui/button"
import { TinkariaSidebarMark } from "../components/branding/TinkariaSidebarMark"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import { cn } from "../lib/utils"
import { ChatRow } from "../components/chat-ui/sidebar/ChatRow"
import { LocalProjectsSection } from "../components/chat-ui/sidebar/LocalProjectsSection"
import type { AgentProvider, DiscoveredSession, SidebarData, SidebarChatRow, UpdateSnapshot } from "../../shared/types"
import type { SocketStatus } from "./socket-interface"
import { useProjectGroupOrderStore } from "../stores/projectGroupOrderStore"
import { shouldCloseMobileSidebarFromSwipe, type MobileSidebarSwipeState } from "./ChatPage"

interface TinkariaSidebarProps {
  data: SidebarData
  activeChatId: string | null
  connectionStatus: SocketStatus
  ready: boolean
  open: boolean
  collapsed: boolean
  showMobileOpenButton: boolean
  onOpen: () => void
  onClose: () => void
  onCollapse: () => void
  onExpand: () => void
  onCreateChat: (projectId: string) => void
  onDeleteChat: (chat: SidebarChatRow) => void
  onRenameChat: (chatId: string, title: string) => void
  onRemoveProject: (projectId: string) => void
  updateSnapshot: UpdateSnapshot | null
  onInstallUpdate: () => void
  sessionsForProject: (projectId: string) => DiscoveredSession[]
  sessionsWindowDaysForProject: (projectId: string) => number
  onOpenSessionPicker: (projectId: string, open: boolean) => void
  onResumeSession: (projectId: string, sessionId: string, provider: AgentProvider) => void
  onRefreshSessions: (projectId: string) => void
  onShowMoreSessions: (projectId: string) => void
}

const DESKTOP_SIDEBAR_SHELL_TITLE = "Tinkaria"

type DesktopShellRuntimeWindow = {
  __TAURI_INTERNALS__: object
}

interface DesktopShellWindowApi {
  isMaximized(): Promise<boolean>
  toggleMaximize(): Promise<void>
  startDragging(): Promise<void>
}

export function hasDesktopShellRuntime(value: unknown): value is DesktopShellRuntimeWindow {
  return typeof value === "object"
    && value !== null
    && "__TAURI_INTERNALS__" in value
    && typeof (value as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === "object"
    && (value as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== null
}

export function shouldShowDesktopSidebarShellControls(windowLike: unknown): boolean {
  return hasDesktopShellRuntime(windowLike)
}

export function getDesktopSidebarShellTitle(): string {
  return DESKTOP_SIDEBAR_SHELL_TITLE
}

async function getDesktopShellWindowApi(windowLike: unknown): Promise<DesktopShellWindowApi | null> {
  if (!hasDesktopShellRuntime(windowLike)) {
    return null
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

export function TinkariaSidebar({
  data,
  activeChatId,
  connectionStatus,
  ready,
  open,
  collapsed,
  showMobileOpenButton,
  onOpen,
  onClose,
  onCollapse,
  onExpand,
  onCreateChat,
  onDeleteChat,
  onRenameChat,
  onRemoveProject,
  updateSnapshot,
  onInstallUpdate,
  sessionsForProject,
  sessionsWindowDaysForProject,
  onOpenSessionPicker,
  onResumeSession,
  onRefreshSessions,
  onShowMoreSessions,
}: TinkariaSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const chatsPerProject = 10
  const mobileSidebarSwipeRef = useRef<MobileSidebarSwipeState | null>(null)

  const handleSwipePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [])

  const handleSwipePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = mobileSidebarSwipeRef.current
    if (!swipe || swipe.pointerId !== event.pointerId) return

    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches
    if (!shouldCloseMobileSidebarFromSwipe({
      startX: swipe.startX,
      startY: swipe.startY,
      currentX: event.clientX,
      currentY: event.clientY,
      viewportWidth: window.innerWidth,
      isMobileViewport,
      isSidebarOpen: open,
      target: swipe.target,
    })) return

    mobileSidebarSwipeRef.current = null
    onClose()
  }, [open, onClose])

  const handleSwipePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobileSidebarSwipeRef.current?.pointerId === event.pointerId) {
      mobileSidebarSwipeRef.current = null
    }
  }, [])

  const savedOrder = useProjectGroupOrderStore((s) => s.order)
  const setGroupOrder = useProjectGroupOrderStore((s) => s.setOrder)

  const orderedProjectGroups = useMemo(() => {
    if (savedOrder.length === 0) return data.projectGroups

    const groupMap = new Map(data.projectGroups.map((g) => [g.groupKey, g]))
    const ordered = savedOrder
      .filter((key) => groupMap.has(key))
      .map((key) => groupMap.get(key)!)

    const orderedKeys = new Set(savedOrder)
    for (const group of data.projectGroups) {
      if (!orderedKeys.has(group.groupKey)) ordered.push(group)
    }

    return ordered
  }, [data.projectGroups, savedOrder])

  const handleReorderGroups = useCallback(
    (newOrder: string[]) => setGroupOrder(newOrder),
    [setGroupOrder]
  )

  const projectIdByPath = useMemo(
    () => new Map(data.projectGroups.map((group) => [group.localPath, group.groupKey])),
    [data.projectGroups]
  )

  const activeVisibleCount = useMemo(
    () => data.projectGroups.reduce((count, group) => count + group.chats.length, 0),
    [data.projectGroups]
  )

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const toggleExpandedGroup = useCallback((key: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const renderChatRow = useCallback((chat: SidebarChatRow) => (
    <ChatRow
      key={chat._id}
      chat={chat}
      activeChatId={activeChatId}
      nowMs={nowMs}
      onSelectChat={(chatId) => {
        navigate(`/chat/${chatId}`)
        onClose()
      }}
      onDeleteChat={() => onDeleteChat(chat)}
      onRenameChat={onRenameChat}
    />
  ), [activeChatId, navigate, nowMs, onClose, onDeleteChat, onRenameChat])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!activeChatId || !scrollContainerRef.current) return

    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      const activeElement = container?.querySelector(`[data-chat-id="${activeChatId}"]`) as HTMLElement | null
      if (!activeElement || !container) return

      const elementRect = activeElement.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      if (elementRect.top < containerRect.top + 38) {
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop
        container.scrollTo({ top: relativeTop - 38, behavior: "smooth" })
      } else if (elementRect.bottom > containerRect.bottom) {
        const elementCenter = elementRect.top + elementRect.height / 2 - containerRect.top + container.scrollTop
        const containerCenter = container.clientHeight / 2
        container.scrollTo({ top: elementCenter - containerCenter, behavior: "smooth" })
      }
    })
  }, [activeChatId, activeVisibleCount])

  const hasVisibleChats = activeVisibleCount > 0
  const isLocalProjectsActive = location.pathname === "/"
  const isSettingsActive = location.pathname.startsWith("/settings")
  const isUtilityPageActive = isLocalProjectsActive || isSettingsActive
  const isConnecting = connectionStatus === "connecting" || !ready
  const statusLabel = isConnecting ? "Connecting" : connectionStatus === "connected" ? "Connected" : "Disconnected"
  const statusDotClass = connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
  const showUpdateButton = updateSnapshot?.updateAvailable === true
  const showDevBadge = updateSnapshot
    ? updateSnapshot.latestVersion === `${updateSnapshot.currentVersion}-dev`
    : false
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"
  const showDesktopShellControls = shouldShowDesktopSidebarShellControls(
    typeof window === "undefined" ? null : window,
  )
  const [isDesktopMaximized, setIsDesktopMaximized] = useState(false)

  async function handleDesktopMovePointerDown(event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const desktopWindow = await getDesktopShellWindowApi(window)
    if (!desktopWindow) {
      return
    }

    await desktopWindow.startDragging()
  }

  async function handleDesktopMaximizeToggle() {
    const desktopWindow = await getDesktopShellWindowApi(window)
    if (!desktopWindow) {
      return
    }

    const nextValue = !(await desktopWindow.isMaximized())
    await desktopWindow.toggleMaximize()
    setIsDesktopMaximized(nextValue)
  }

  return (
    <>
      {!open && showMobileOpenButton && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 left-3 z-50 md:hidden"
          onClick={onOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {collapsed && isUtilityPageActive && (
        <div className="hidden md:flex fixed left-0 top-0 h-full z-40 items-start pt-4 pl-5 border-l border-border/0">
          <div
            className="group/desktop-collapsed-shell flex items-center gap-1 rounded-full bg-background/80 pr-1 backdrop-blur-sm"
            data-tauri-drag-region={showDesktopShellControls ? "true" : undefined}
          >
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
              <TinkariaSidebarMark className="absolute inset-0 size-full" imageClassName="size-5" />
              <Button
                variant="ghost"
                size="icon"
                onClick={onExpand}
                title="Expand sidebar"
                className="absolute inset-0 size-8 rounded-full opacity-0 pointer-events-none transition-all duration-200 ease-out scale-90 group-hover/desktop-collapsed-shell:pointer-events-auto group-hover/desktop-collapsed-shell:opacity-100 group-hover/desktop-collapsed-shell:scale-100"
              >
                <PanelLeft className="h-4 w-4 text-slate-500/85 dark:text-slate-300/85" />
              </Button>
            </div>
            {showDesktopShellControls ? (
              <div className="flex items-center gap-1 opacity-0 pointer-events-none translate-x-1 transition-all duration-200 group-hover/desktop-collapsed-shell:pointer-events-auto group-hover/desktop-collapsed-shell:translate-x-0 group-hover/desktop-collapsed-shell:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full"
                  title="Toggle maximize"
                  onClick={() => {
                    void handleDesktopMaximizeToggle()
                  }}
                >
                  <Maximize2 className={cn("size-4", isDesktopMaximized && "opacity-60")} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full"
                  title="Move window"
                  onMouseDown={(event) => {
                    void handleDesktopMovePointerDown(event)
                  }}
                >
                  <Grip className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div
        {...getUiIdentityAttributeProps("chat.sidebar")}
        data-sidebar="open"
        className={cn(
          "fixed inset-0 z-50 bg-background dark:bg-card flex flex-col h-[100dvh] select-none",
          "transition-transform duration-300 ease-out",
          "md:relative md:inset-auto md:w-[275px] md:mr-0 md:h-[calc(100dvh-16px)] md:my-2 md:ml-2 md:border md:border-border md:rounded-2xl md:transition-none",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          !open && "pointer-events-none md:pointer-events-auto",
          collapsed && "md:hidden"
        )}
        onPointerDown={handleSwipePointerDown}
        onPointerMove={handleSwipePointerMove}
        onPointerUp={handleSwipePointerEnd}
        onPointerCancel={handleSwipePointerEnd}
      >
        <div className=" pl-3 pr-[7px] h-[64px] max-h-[64px] md:h-[55px] md:max-h-[55px] border-b flex items-center justify-between">
          <div
            className="group/sidebar-shell flex min-w-0 items-center gap-2"
            data-tauri-drag-region={showDesktopShellControls ? "true" : undefined}
          >
            <div className="relative hidden md:flex h-8 w-8 shrink-0 items-center justify-center">
              <TinkariaSidebarMark
                className="absolute inset-0 size-full"
                imageClassName="h-5 w-5"
              />
            </div>
            <TinkariaSidebarMark className="h-5 w-5 sm:h-6 sm:w-6 md:hidden" imageClassName="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="font-logo text-base uppercase sm:text-md text-slate-600 dark:text-slate-100">
              {showDesktopShellControls ? getDesktopSidebarShellTitle() : APP_NAME}
            </span>
          </div>
          <div className="flex items-center">
            {showDevBadge ? (
              <span
                className="mr-1 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold tracking-wider text-muted-foreground"
                title="Development build"
              >
                DEV
              </span>
            ) : showUpdateButton ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full !h-auto mr-1 py-0.5 px-2 bg-logo/20 hover:bg-logo text-logo border-logo/20 hover:text-foreground hover:border-logo/20  text-[11px] font-bold tracking-wider"
                onClick={onInstallUpdate}
                disabled={isUpdating}
                title={updateSnapshot?.latestVersion ? `Update to ${updateSnapshot.latestVersion}` : `Update ${APP_NAME}`}
              >
                {isUpdating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                UPDATE
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigate("/")
                onClose()
              }}
              className="size-10 rounded-lg"
              title="New project"
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          <div className="p-[7px]">
            {!hasVisibleChats && isConnecting ? (
              <div className="space-y-5 px-1 pt-3">
                {[0, 1, 2].map((section) => (
                  <div key={section} className="space-y-2 animate-pulse">
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="space-y-1">
                      {[0, 1, 2].map((row) => (
                        <div key={row} className="flex items-center gap-2 rounded-md px-3 py-2">
                          <div className="h-3.5 w-3.5 rounded-full bg-muted" />
                          <div
                            className={cn(
                              "h-3.5 rounded bg-muted",
                              row === 0 ? "w-32" : row === 1 ? "w-40" : "w-28"
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!hasVisibleChats && !isConnecting && data.projectGroups.length === 0 ? (
              <p className="text-sm text-slate-400 p-2 mt-6 text-center">No conversations yet</p>
            ) : null}

            <LocalProjectsSection
              projectGroups={orderedProjectGroups}
              onReorderGroups={handleReorderGroups}
              collapsedSections={collapsedSections}
              expandedGroups={expandedGroups}
              onToggleSection={toggleSection}
              onToggleExpandedGroup={toggleExpandedGroup}
              renderChatRow={renderChatRow}
              chatsPerProject={chatsPerProject}
              onNewLocalChat={(localPath) => {
                const projectId = projectIdByPath.get(localPath)
                if (projectId) {
                  onCreateChat(projectId)
                }
              }}
              onRemoveProject={onRemoveProject}
              isConnected={connectionStatus === "connected"}
              sessionsForProject={sessionsForProject}
              sessionsWindowDaysForProject={sessionsWindowDaysForProject}
              onOpenSessionPicker={onOpenSessionPicker}
              onNavigateToChat={(chatId) => {
                navigate(`/chat/${chatId}`)
                onClose()
              }}
              onResumeSession={onResumeSession}
              onRefreshSessions={onRefreshSessions}
              onShowMoreSessions={onShowMoreSessions}
            />
          </div>
        </div>

        <div className="border-t border-border p-2">
            <button
            type="button"
            onClick={() => {
              navigate("/settings/general")
              onClose()
            }}
            className={cn(
              "w-full rounded-xl rounded-t-md border px-3 py-2 text-left transition-colors",
              isSettingsActive
                ? "bg-muted border-border"
                : "border-border/0 hover:bg-muted hover:border-border active:bg-muted/80"
            )}
          >
            <div className="flex items- justify-between gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Settings</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                {isConnecting ? (
                  <Loader2 className="h-2 w-2 animate-spin" />
                ) : (
                  <span className={cn("h-2 w-2 rounded-full", statusDotClass)} />
                )}
              </div>
            </div>
          </button>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden transition-opacity duration-300",
          open ? "bg-black/40 opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
    </>
  )
}
