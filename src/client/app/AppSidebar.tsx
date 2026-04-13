import { lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Home, Loader2, Menu, PanelLeft, X } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import { Button } from "../components/ui/button"
import { TinkariaSidebarMark } from "../components/branding/TinkariaSidebarMark"
import { createC3UiIdentityDescriptor, getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import { cn } from "../lib/utils"
import { ChatRow } from "../components/chat-ui/sidebar/ChatRow"
const LocalProjectsSection = lazy(() => import("../components/chat-ui/sidebar/LocalProjectsSection").then(m => ({ default: m.LocalProjectsSection })))
import { WorkspacesSection } from "../components/chat-ui/sidebar/WorkspacesSection"
import type { SidebarData, SidebarChatRow, UpdateSnapshot } from "../../shared/types"
import type { SocketStatus } from "./socket-interface"
import { shouldCloseMobileSidebarFromSwipe, type MobileSidebarSwipeState } from "./ChatPage"

interface AppSidebarProps {
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
  onCreateChat: (workspaceId: string) => void
  onDeleteChat: (chat: SidebarChatRow) => void
  onRenameChat: (chatId: string, title: string) => void
  onRemoveProject: (workspaceId: string) => void
  updateSnapshot: UpdateSnapshot | null
  onInstallUpdate: () => void
  onMergeSession?: (workspaceId: string) => void
  onCreateWorkspace?: () => void
}

interface SidebarDialogNavigationState {
  sidebarDialog?: "fork" | "merge"
}

export function areAppSidebarPropsEqual(previous: AppSidebarProps, next: AppSidebarProps): boolean {
  return (
    previous.data === next.data
    && previous.activeChatId === next.activeChatId
    && previous.connectionStatus === next.connectionStatus
    && previous.ready === next.ready
    && previous.open === next.open
    && previous.collapsed === next.collapsed
    && previous.showMobileOpenButton === next.showMobileOpenButton
    && previous.updateSnapshot === next.updateSnapshot
  )
}

const SIDEBAR_UI_DESCRIPTOR = createC3UiIdentityDescriptor({
  id: "chat.sidebar",
  c3ComponentId: "c3-113",
  c3ComponentLabel: "sidebar",
})

export function getSidebarUiIdentityDescriptor() {
  return SIDEBAR_UI_DESCRIPTOR
}

function AppSidebarInner({
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
  onMergeSession,
  onCreateWorkspace,
}: AppSidebarProps) {
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

  const orderedProjectGroups = data.workspaceGroups

  const workspaceIdByPath = useMemo(
    () => new Map(data.workspaceGroups.map((group) => [group.localPath, group.groupKey])),
    [data.workspaceGroups]
  )

  const activeVisibleCount = useMemo(
    () => data.workspaceGroups.reduce((count, group) => count + group.chats.length, 0),
    [data.workspaceGroups]
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
      onForkChat={(chatId) => {
        navigate(`/chat/${chatId}`, { state: { sidebarDialog: "fork" } satisfies SidebarDialogNavigationState })
        onClose()
      }}
      onMergeWithChat={(chatId) => {
        navigate(`/chat/${chatId}`, { state: { sidebarDialog: "merge" } satisfies SidebarDialogNavigationState })
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
  const isUtilityPageActive = isLocalProjectsActive
  const isConnecting = connectionStatus === "connecting" || !ready
  const statusLabel = isConnecting ? "Connecting" : connectionStatus === "connected" ? "Connected" : "Disconnected"
  const statusDotClass = connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
  const showUpdateButton = updateSnapshot?.updateAvailable === true
  const showDevBadge = updateSnapshot
    ? updateSnapshot.latestVersion === `${updateSnapshot.currentVersion}-dev`
    : false
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"

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
          <div className="group/desktop-collapsed-shell flex items-center gap-1 rounded-full bg-background/80 pr-1 backdrop-blur-sm">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <TinkariaSidebarMark className="absolute inset-0 size-full" imageClassName="size-6" />
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
          </div>
        </div>
      )}

      <div
        {...getUiIdentityAttributeProps(SIDEBAR_UI_DESCRIPTOR)}
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
        <div className="pl-2 pr-[7px] h-[64px] max-h-[64px] md:h-[55px] md:max-h-[55px] border-b flex items-center justify-between">
          <Button
            variant="ghost"
            className="group/sidebar-shell flex min-w-0 items-center gap-2 px-2 rounded-lg text-left transition-colors hover:text-foreground"
            onClick={() => {
              navigate("/")
              onClose()
            }}
            title="Home"
            aria-label="Go to homepage"
          >
            <div className="relative hidden md:flex h-9 w-9 shrink-0 items-center justify-center">
              <TinkariaSidebarMark
                className="absolute inset-0 size-full"
                imageClassName="h-6 w-6"
              />
            </div>
            <TinkariaSidebarMark className="h-6 w-6 sm:h-7 sm:w-7 md:hidden" imageClassName="h-5 w-5 sm:h-5.5 sm:w-5.5" />
            <span className="font-logo text-base uppercase sm:text-md text-slate-600 dark:text-slate-100">
              {APP_NAME}
            </span>
          </Button>
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
              title="Home"
              aria-label="Home"
            >
              <Home className="size-4" />
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

            {!hasVisibleChats && !isConnecting && data.workspaceGroups.length === 0 ? (
              <p className="text-sm text-slate-400 p-2 mt-6 text-center">No conversations yet</p>
            ) : null}

            <WorkspacesSection
              workspaces={data.independentWorkspaces}
              onSelect={(wsId) => {
                navigate(`/workspace/${wsId}`)
                onClose()
              }}
              onCreate={() => onCreateWorkspace?.()}
              activeWorkspaceId={location.pathname.startsWith("/workspace/") ? location.pathname.split("/")[2] : null}
            />

            <Suspense fallback={null}>
              <LocalProjectsSection
                workspaceGroups={orderedProjectGroups}
                collapsedSections={collapsedSections}
                expandedGroups={expandedGroups}
                onToggleSection={toggleSection}
                onToggleExpandedGroup={toggleExpandedGroup}
                renderChatRow={renderChatRow}
                chatsPerProject={chatsPerProject}
                onNewLocalChat={(localPath) => {
                  const workspaceId = workspaceIdByPath.get(localPath)
                  if (workspaceId) {
                    onCreateChat(workspaceId)
                  }
                }}
                onRemoveProject={onRemoveProject}
                isConnected={connectionStatus === "connected"}
                onMergeSession={onMergeSession}
              />
            </Suspense>
          </div>
        </div>

        <div className="border-t border-border p-2">
          <div className="w-full rounded-xl border border-border/0 px-3 py-2 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Connection</span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                {isConnecting ? (
                  <Loader2 className="h-2 w-2 animate-spin" />
                ) : (
                  <span className={cn("h-2 w-2 rounded-full", statusDotClass)} />
                )}
              </div>
            </div>
          </div>
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

export const AppSidebar = memo(AppSidebarInner, areAppSidebarPropsEqual)
