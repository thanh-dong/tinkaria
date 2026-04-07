import type { ReactNode } from "react"
import { Pencil, Trash2 } from "lucide-react"
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
  onRemove,
  children,
}: {
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent uiId={PROJECT_GROUP_MENU_DESCRIPTOR}>
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
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ChatRowMenu({
  onRename,
  onDelete,
  children,
}: {
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
