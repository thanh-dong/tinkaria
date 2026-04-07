import { memo, useCallback, useMemo, useRef, useState } from "react"
import { Flower, History, RefreshCw, Search, Terminal } from "lucide-react"
import { formatRelativeTime } from "../../lib/formatters"
import {
  createC3UiIdentityDescriptor,
  createUiIdentity,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../../lib/uiIdentityOverlay"
import { useIsMobile } from "../../hooks/useIsMobile"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogGhostButton,
  DialogHeader,
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
  RESPONSIVE_MODAL_HEADER_CLASS_NAME,
  DialogTitle,
} from "../ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import type { DiscoveredSession } from "../../../shared/types"

const SESSION_PICKER_UI_DESCRIPTORS = {
  triggerAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("sidebar.project-group.sessions", "action"),
    c3ComponentId: "c3-113",
    c3ComponentLabel: "sidebar",
  }),
  popover: createC3UiIdentityDescriptor({
    id: createUiIdentity("sidebar.project-group.sessions", "popover"),
    c3ComponentId: "c3-113",
    c3ComponentLabel: "sidebar",
  }),
  dialog: createC3UiIdentityDescriptor({
    id: "sidebar.project-group.sessions.dialog",
    c3ComponentId: "c3-113",
    c3ComponentLabel: "sidebar",
  }),
  searchInput: createC3UiIdentityDescriptor({
    id: "sidebar.project-group.sessions.search.input",
    c3ComponentId: "c3-113",
    c3ComponentLabel: "sidebar",
  }),
  list: createC3UiIdentityDescriptor({
    id: "sidebar.project-group.sessions.list",
    c3ComponentId: "c3-113",
    c3ComponentLabel: "sidebar",
  }),
} as const
const SESSION_PICKER_UI_IDENTITIES = getUiIdentityIdMap(SESSION_PICKER_UI_DESCRIPTORS)

export function getSessionPickerUiIdentities() {
  return SESSION_PICKER_UI_IDENTITIES
}

export function getSessionPickerUiIdentityDescriptors() {
  return SESSION_PICKER_UI_DESCRIPTORS
}

const SESSION_PICKER_TRIGGER_CLASS_NAME = "opacity-100 md:opacity-0 md:group-hover/section:opacity-100 transition-opacity"
export function getSessionPickerTriggerClassName() {
  return SESSION_PICKER_TRIGGER_CLASS_NAME
}

// --- Helpers ---

function sessionDisplayTitle(session: DiscoveredSession): string {
  const title = typeof (session.title as unknown) === "string"
    ? session.title.trim()
    : ""
  if (title) return title

  const questionValue = session.lastExchange?.question
  if (typeof questionValue === "string") {
    const question = questionValue.trim()
    if (question) return question
  }

  return session.sessionId
}

function SourceIcon({ source }: { source: "tinkaria" | "cli" }) {
  return source === "tinkaria" ? (
    <Flower className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  ) : (
    <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  )
}

// --- SessionPickerContent (testable inner component) ---

interface SessionPickerContentProps {
  sessions: DiscoveredSession[]
  windowDays: number
  searchQuery: string
  onSelectSession: (session: DiscoveredSession) => void
  onRefresh: () => void
  onSearchChange: (query: string) => void
  onShowMore: () => void
  isRefreshing: boolean
  sidebarChatIds?: Set<string>
}

interface VisibleSessionsOptions {
  sessions: DiscoveredSession[]
  searchQuery: string
  windowDays: number
  now?: number
  sidebarChatIds?: Set<string>
}

export function getVisibleSessions({
  sessions,
  searchQuery,
  windowDays,
  now = Date.now(),
  sidebarChatIds,
}: VisibleSessionsOptions): {
  sessions: DiscoveredSession[]
  hasMore: boolean
} {
  // Exclude sessions already visible on the sidebar
  const eligible = sidebarChatIds
    ? sessions.filter((session) => !(session.chatId && sidebarChatIds.has(session.chatId)))
    : sessions

  const cutoff = now - windowDays * 24 * 60 * 60 * 1000
  const recentSessions = eligible.filter((session) => session.modifiedAt >= cutoff)

  if (!searchQuery) {
    return {
      sessions: recentSessions.slice(0, 25),
      hasMore: eligible.some((session) => session.modifiedAt < cutoff),
    }
  }

  const lower = searchQuery.toLowerCase()
  return {
    sessions: eligible.filter((session) => {
      const title = sessionDisplayTitle(session).toLowerCase()
      const question = (session.lastExchange?.question ?? "").toLowerCase()
      return title.includes(lower) || question.includes(lower)
    }),
    hasMore: false,
  }
}

export const SessionPickerContent = memo(function SessionPickerContent({
  sessions,
  windowDays,
  searchQuery,
  onSelectSession,
  onRefresh,
  onSearchChange,
  onShowMore,
  isRefreshing,
  sidebarChatIds,
}: SessionPickerContentProps) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () => getVisibleSessions({ sessions, searchQuery, windowDays, sidebarChatIds }),
    [sessions, searchQuery, windowDays, sidebarChatIds]
  )
  const filtered = visible.sessions

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filtered.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((prev) => {
          const next = prev < filtered.length - 1 ? prev + 1 : 0
          listRef.current?.children[0]?.children[next]?.scrollIntoView({ block: "nearest" })
          return next
        })
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((prev) => {
          const next = prev > 0 ? prev - 1 : filtered.length - 1
          listRef.current?.children[0]?.children[next]?.scrollIntoView({ block: "nearest" })
          return next
        })
      } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault()
        onSelectSession(filtered[activeIndex])
      }
    },
    [filtered, activeIndex, onSelectSession]
  )

  return (
    <div className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
      {/* Header row: search + refresh */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            {...getUiIdentityAttributeProps(SESSION_PICKER_UI_DESCRIPTORS.searchInput)}
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value)
              setActiveIndex(-1)
            }}
            className="w-full text-xs pl-6 pr-2 py-1.5 bg-muted/50 border border-border rounded-lg outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 transition-colors"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="shrink-0"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
        </Button>
      </div>

      {/* Session list */}
      <div
        ref={listRef}
        className="max-h-[300px] overflow-y-auto [scrollbar-width:thin] -mx-1"
        {...getUiIdentityAttributeProps(SESSION_PICKER_UI_DESCRIPTORS.list)}
      >
        {filtered.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">
            No sessions found
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((session, index) => (
              <button
                key={session.sessionId}
                onClick={() => onSelectSession(session)}
                className={cn(
                  "flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-muted/50 mx-1",
                  index === activeIndex && "bg-muted/50"
                )}
              >
                <SourceIcon source={session.source} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">
                      {sessionDisplayTitle(session)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 leading-none">
                      {session.provider}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(session.modifiedAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Show more button */}
      {visible.hasMore ? (
        <button
          onClick={onShowMore}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
        >
          Show older sessions
        </button>
      ) : null}
    </div>
  )
})

// --- SessionPicker (full popover wrapper) ---

interface SessionPickerProps {
  sessions: DiscoveredSession[]
  isLoading: boolean
  windowDays: number
  onSelectSession: (session: DiscoveredSession) => void
  onRefresh: () => void
  onShowMore: () => void
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  sidebarChatIds?: Set<string>
}

export const SessionPicker = memo(function SessionPicker({
  sessions,
  isLoading,
  windowDays,
  onSelectSession,
  onRefresh,
  onShowMore,
  onOpenChange,
  disabled = false,
  sidebarChatIds,
}: SessionPickerProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSearchQuery("")
    onOpenChange?.(next)
  }

  function handleSelectSession(session: DiscoveredSession) {
    onSelectSession(session)
    handleOpenChange(false)
  }

  const trigger = (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      className={SESSION_PICKER_TRIGGER_CLASS_NAME}
      {...getUiIdentityAttributeProps(SESSION_PICKER_UI_DESCRIPTORS.triggerAction)}
    >
      <History className="h-3.5 w-3.5" />
    </Button>
  )

  const content = (
    <SessionPickerContent
      sessions={sessions}
      windowDays={windowDays}
      searchQuery={searchQuery}
      onSelectSession={handleSelectSession}
      onRefresh={onRefresh}
      onSearchChange={setSearchQuery}
      onShowMore={onShowMore}
      isRefreshing={isLoading}
      sidebarChatIds={sidebarChatIds}
    />
  )

  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={() => handleOpenChange(true)}
          className={SESSION_PICKER_TRIGGER_CLASS_NAME}
          {...getUiIdentityAttributeProps(SESSION_PICKER_UI_DESCRIPTORS.triggerAction)}
        >
          <History className="h-3.5 w-3.5" />
        </Button>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent
            size="sm"
            className={RESPONSIVE_MODAL_CONTENT_CLASS_NAME}
            {...getUiIdentityAttributeProps(SESSION_PICKER_UI_DESCRIPTORS.dialog)}
          >
            <DialogHeader className={RESPONSIVE_MODAL_HEADER_CLASS_NAME}>
              <DialogTitle>Sessions</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4 pt-3.5 flex min-h-0 flex-1 flex-col overflow-hidden">
              {content}
            </div>
            <DialogFooter className={RESPONSIVE_MODAL_FOOTER_CLASS_NAME}>
              <DialogGhostButton onClick={() => handleOpenChange(false)}>
                Close
              </DialogGhostButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        sideOffset={8}
        align="start"
        className="w-72 p-3"
        {...getUiIdentityAttributeProps(SESSION_PICKER_UI_DESCRIPTORS.popover)}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
})
