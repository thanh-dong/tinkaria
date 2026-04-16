import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Archive,
  ArchiveRestore,
  GitBranchPlus,
  Merge,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import type { SidebarChatRow } from "../../../shared/types"
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../../lib/uiIdentityOverlay"
import { formatRelativeTime } from "../../lib/formatters"
import { cn } from "../../lib/utils"
import { useArchivedSessionsStore, isArchivedChat } from "../../stores/archivedSessionsStore"
import { PROVIDER_ICONS } from "../icons/ProviderIcons"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
  PanelBody,
  PanelCollapsibleSection,
  PanelEmptyState,
  PanelHeader,
  PanelListItem,
} from "../coordination/CoordinationPanel"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

const PROJECT_SESSIONS_UI_DESCRIPTORS = {
  panel: createC3UiIdentityDescriptor({
    id: "project.sessions.panel",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  list: createC3UiIdentityDescriptor({
    id: "project.sessions.list",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  item: createC3UiIdentityDescriptor({
    id: "project.sessions.item",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  archived: createC3UiIdentityDescriptor({
    id: "project.sessions.archived",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  newChatAction: createC3UiIdentityDescriptor({
    id: "project.sessions.new-chat.action",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
  emptyState: createC3UiIdentityDescriptor({
    id: "project.sessions.empty-state",
    c3ComponentId: "c3-117",
    c3ComponentLabel: "projects",
  }),
} as const

const PROJECT_SESSIONS_UI_IDENTITIES = getUiIdentityIdMap(PROJECT_SESSIONS_UI_DESCRIPTORS)

export function getProjectSessionsPanelUiIdentityDescriptors() {
  return PROJECT_SESSIONS_UI_DESCRIPTORS
}

export function getProjectSessionsPanelUiIdentities() {
  return PROJECT_SESSIONS_UI_IDENTITIES
}

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-zinc-400",
  starting: "bg-amber-400",
  running: "bg-emerald-400",
  waiting_for_user: "bg-blue-400",
  awaiting_agents: "bg-blue-400",
  failed: "bg-red-400",
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  waiting_for_user: "Waiting",
  awaiting_agents: "Awaiting agents",
  failed: "Failed",
}

const loadingStatuses = new Set(["starting", "running"])

interface ProjectSessionsPanelProps {
  groupKey: string
  chats: SidebarChatRow[]
  onCreateChat: (workspaceId: string) => void
  onDeleteChat: (chat: SidebarChatRow) => void
  onRenameChat: (chatId: string, title: string) => void
  onForkChat: (chatId: string) => void
  onMergeSession: (workspaceId: string) => void
}

export function ProjectSessionsPanel({
  groupKey,
  chats,
  onCreateChat,
  onDeleteChat,
  onRenameChat,
  onForkChat,
  onMergeSession,
}: ProjectSessionsPanelProps) {
  const navigate = useNavigate()
  const archivedIds = useArchivedSessionsStore((s) => s.archivedIds)
  const archiveChat = useArchivedSessionsStore((s) => s.archive)
  const unarchiveChat = useArchivedSessionsStore((s) => s.unarchive)

  const activeChats = chats.filter((c) => !isArchivedChat(archivedIds, c.chatId))
  const archivedChats = chats.filter((c) => isArchivedChat(archivedIds, c.chatId))

  return (
    <div
      className="flex flex-col h-full"
      {...getUiIdentityAttributeProps(PROJECT_SESSIONS_UI_DESCRIPTORS.panel)}
    >
      <PanelHeader
        title="Sessions"
        count={activeChats.length}
        onAdd={() => onCreateChat(groupKey)}
        addLabel="New chat"
      />
      <PanelBody>
        {activeChats.length === 0 ? (
          <PanelEmptyState
            message="No active sessions"
            description="Start a new chat to begin working on this project."
            actionLabel="New chat"
            onAction={() => onCreateChat(groupKey)}
          />
        ) : (
          <div {...getUiIdentityAttributeProps(PROJECT_SESSIONS_UI_DESCRIPTORS.list)}>
            {activeChats.map((chat) => (
              <SessionRow
                key={chat.chatId}
                chat={chat}
                onSelect={() => navigate(`/chat/${chat.chatId}`)}
                onFork={() => onForkChat(chat.chatId)}
                onMerge={() => onMergeSession(groupKey)}
                onRename={(title) => onRenameChat(chat.chatId, title)}
                onArchive={() => archiveChat(chat.chatId)}
                onDelete={() => onDeleteChat(chat)}
              />
            ))}
          </div>
        )}
        {archivedChats.length > 0 && (
          <div {...getUiIdentityAttributeProps(PROJECT_SESSIONS_UI_DESCRIPTORS.archived)}>
            <PanelCollapsibleSection label="Archived" count={archivedChats.length}>
              {archivedChats.map((chat) => (
                <SessionRow
                  key={chat.chatId}
                  chat={chat}
                  archived
                  onSelect={() => navigate(`/chat/${chat.chatId}`)}
                  onUnarchive={() => unarchiveChat(chat.chatId)}
                  onDelete={() => onDeleteChat(chat)}
                />
              ))}
            </PanelCollapsibleSection>
          </div>
        )}
      </PanelBody>
    </div>
  )
}

function SessionRow({
  chat,
  archived,
  onSelect,
  onFork,
  onMerge,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  chat: SidebarChatRow
  archived?: boolean
  onSelect: () => void
  onFork?: () => void
  onMerge?: () => void
  onRename?: (title: string) => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(chat.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const ProviderIcon = chat.provider ? PROVIDER_ICONS[chat.provider] : null
  const statusColor = STATUS_COLORS[chat.status] ?? STATUS_COLORS.idle
  const statusLabel = STATUS_LABELS[chat.status] ?? chat.status
  const isLoading = loadingStatuses.has(chat.status)

  function commitRename() {
    const trimmed = editValue.trim()
    setIsEditing(false)
    if (trimmed && trimmed !== chat.title && onRename) {
      onRename(trimmed)
    } else {
      setEditValue(chat.title)
    }
  }

  function startEditing() {
    setEditValue(chat.title)
    setIsEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  return (
    <PanelListItem className="group/row cursor-pointer">
      <div
        className="flex items-center gap-2"
        onClick={onSelect}
        {...getUiIdentityAttributeProps(PROJECT_SESSIONS_UI_DESCRIPTORS.item)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={cn("size-2 rounded-full shrink-0", statusColor, isLoading && "animate-pulse")}
            title={statusLabel}
          />
          {isEditing ? (
            <Input
              ref={inputRef}
              size="sm"
              className="flex-1 h-6 text-sm"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  setEditValue(chat.title)
                  setIsEditing(false)
                }
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm truncate flex-1" onDoubleClick={(e) => { e.stopPropagation(); startEditing() }}>
              {isLoading ? (
                <AnimatedShinyText animate shimmerWidth={Math.max(20, chat.title.length * 3)}>
                  {chat.title}
                </AnimatedShinyText>
              ) : (
                chat.title
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {chat.model ? (
            <span className="max-w-20 truncate rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
              {chat.model}
            </span>
          ) : null}
          {ProviderIcon ? (
            <span className="flex size-5 items-center justify-center text-muted-foreground/55">
              <ProviderIcon className="size-2.5" />
            </span>
          ) : null}
          {chat.lastMessageAt ? (
            <span className="text-[11px] text-muted-foreground/50 w-10 text-right">
              {formatRelativeTime(chat.lastMessageAt)}
            </span>
          ) : null}
          <SessionRowActions
            archived={archived}
            onFork={onFork}
            onMerge={onMerge}
            onRename={onRename ? startEditing : undefined}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
          />
        </div>
      </div>
    </PanelListItem>
  )
}

function SessionRowActions({
  archived,
  onFork,
  onMerge,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  archived?: boolean
  onFork?: () => void
  onMerge?: () => void
  onRename?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 opacity-0 group-hover/row:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {onFork && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onFork() }}>
            <GitBranchPlus className="size-4" />
            <span>Fork</span>
          </DropdownMenuItem>
        )}
        {onMerge && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMerge() }}>
            <Merge className="size-4" />
            <span>Merge sessions</span>
          </DropdownMenuItem>
        )}
        {onRename && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename() }}>
            <Pencil className="size-4" />
            <span>Rename</span>
          </DropdownMenuItem>
        )}
        {onArchive && !archived && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive() }}>
            <Archive className="size-4" />
            <span>Archive</span>
          </DropdownMenuItem>
        )}
        {onUnarchive && archived && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUnarchive() }}>
            <ArchiveRestore className="size-4" />
            <span>Unarchive</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-destructive dark:text-red-400 hover:bg-destructive/10 focus:bg-destructive/10"
        >
          <Trash2 className="size-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
