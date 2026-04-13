import type { ReactNode } from "react"
import { GitBranchPlus, LayoutGrid, Merge, Pencil, SquarePen, Trash2 } from "lucide-react"
import { createUiIdentityDescriptor } from "../../../lib/uiIdentityOverlay"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../ui/context-menu"

const PROJECT_GROUP_MENU_UI_ID = "sidebar.project-group.menu"
const CHAT_ROW_MENU_UI_ID = "sidebar.chat-row.menu"
const PROJECT_GROUP_MENU_DESCRIPTOR = createUiIdentityDescriptor({
  id: PROJECT_GROUP_MENU_UI_ID,
  c3ComponentId: "c3-113",
  c3ComponentLabel: "sidebar",
})
const CHAT_ROW_MENU_DESCRIPTOR = createUiIdentityDescriptor({
  id: CHAT_ROW_MENU_UI_ID,
  c3ComponentId: "c3-113",
  c3ComponentLabel: "sidebar",
})

export function ProjectSectionMenu({
  onMergeSession,
  mergeDisabled = false,
  onOpenCoordination,
  onNewChat,
  newChatDisabled = false,
  onRemove,
  children,
}: {
  onMergeSession?: () => void
  mergeDisabled?: boolean
  onOpenCoordination?: () => void
  onNewChat?: () => void
  newChatDisabled?: boolean
  onRemove?: () => void
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent uiId={PROJECT_GROUP_MENU_DESCRIPTOR}>
        {onMergeSession ? (
          <ContextMenuItem
            disabled={mergeDisabled}
            onSelect={(event) => {
              event.stopPropagation()
              onMergeSession()
            }}
          >
            <Merge className="h-4 w-4" />
            <span className="text-xs font-medium">Merge sessions</span>
          </ContextMenuItem>
        ) : null}
        {onOpenCoordination ? (
          <ContextMenuItem
            onSelect={(event) => {
              event.stopPropagation()
              onOpenCoordination()
            }}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="text-xs font-medium">Coordination board</span>
          </ContextMenuItem>
        ) : null}
        {onNewChat ? (
          <ContextMenuItem
            disabled={newChatDisabled}
            onSelect={(event) => {
              event.stopPropagation()
              onNewChat()
            }}
          >
            <SquarePen className="h-4 w-4" />
            <span className="text-xs font-medium">New chat</span>
          </ContextMenuItem>
        ) : null}
        {onRemove ? (
          <ContextMenuItem
            onSelect={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            className="text-destructive dark:text-red-400 hover:bg-destructive/10 focus:bg-destructive/10 dark:hover:bg-red-500/20 dark:focus:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            <span className="text-xs font-medium">Remove</span>
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ChatRowMenu({
  onFork,
  onMergeWith,
  onRename,
  onDelete,
  children,
}: {
  onFork?: () => void
  onMergeWith?: () => void
  onRename: () => void
  onDelete: () => void
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent uiId={CHAT_ROW_MENU_DESCRIPTOR}>
        {onFork ? (
          <ContextMenuItem
            onSelect={(event) => {
              event.stopPropagation()
              onFork()
            }}
          >
            <GitBranchPlus className="h-4 w-4" />
            <span className="text-xs font-medium">Fork</span>
          </ContextMenuItem>
        ) : null}
        {onMergeWith ? (
          <ContextMenuItem
            onSelect={(event) => {
              event.stopPropagation()
              onMergeWith()
            }}
          >
            <Merge className="h-4 w-4" />
            <span className="text-xs font-medium">Merge with</span>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            onRename()
          }}
        >
          <Pencil className="h-4 w-4" />
          <span className="text-xs font-medium">Rename</span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          className="text-destructive dark:text-red-400 hover:bg-destructive/10 focus:bg-destructive/10 dark:hover:bg-red-500/20 dark:focus:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-xs font-medium">Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
