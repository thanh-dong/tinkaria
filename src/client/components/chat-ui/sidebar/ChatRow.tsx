import { useEffect, useRef, useState } from "react"
import { Archive, Loader2 } from "lucide-react"
import type { SidebarChatRow } from "../../../../shared/types"
import { AnimatedShinyText } from "../../ui/animated-shiny-text"
import { Button } from "../../ui/button"
import { formatSidebarAgeLabel } from "../../../lib/formatters"
import { cn, normalizeChatId } from "../../../lib/utils"
import { ChatRowMenu } from "./Menus"

const loadingStatuses = new Set(["starting", "running"])

interface Props {
  chat: SidebarChatRow
  activeChatId: string | null
  nowMs: number
  onSelectChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  onRenameChat: (chatId: string, title: string) => void
}

export function ChatRow({
  chat,
  activeChatId,
  nowMs,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
}: Props) {
  const ageLabel = formatSidebarAgeLabel(chat.lastMessageAt, nowMs)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(chat.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  function commitRename() {
    const trimmed = editValue.trim()
    setIsEditing(false)
    if (trimmed && trimmed !== chat.title) {
      onRenameChat(chat.chatId, trimmed)
    } else {
      setEditValue(chat.title)
    }
  }

  function startEditing() {
    setEditValue(chat.title)
    setIsEditing(true)
  }

  return (
    <ChatRowMenu onRename={startEditing} onDelete={() => onDeleteChat(chat.chatId)}>
      <div
        key={chat._id}
        data-chat-id={normalizeChatId(chat.chatId)}
        className={cn(
          "group flex items-center gap-2 pl-2.5 pr-0.5 py-0.5 rounded-lg cursor-pointer border-border/0 hover:border-border hover:bg-muted/20 active:scale-[0.985] border transition-all",
          activeChatId === normalizeChatId(chat.chatId) ? "bg-muted hover:bg-muted border-border" : "border-border/0 dark:hover:border-slate-400/10 "
        )}
        onClick={() => {
          if (!isEditing) onSelectChat(chat.chatId)
        }}
      >
        {loadingStatuses.has(chat.status) ? (
          <Loader2 className="size-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
        ) : chat.status === "waiting_for_user" ? (
          <div className="relative ">
            <div className=" rounded-full z-0 size-3.5 flex items-center justify-center ">
              <div className="absolute rounded-full z-0 size-2.5 bg-blue-400/80 animate-ping" />
              <div className=" rounded-full z-0 size-2.5 bg-blue-400 ring-2 ring-muted/20 dark:ring-muted/50" />
            </div>
          </div>
        ) : null}
        {isEditing ? (
          <input
            ref={inputRef}
            className="text-sm flex-1 bg-transparent border border-border rounded px-1 py-0 outline-none focus:ring-1 focus:ring-ring translate-y-[-0.5px]"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitRename()
              } else if (event.key === "Escape") {
                event.preventDefault()
                setEditValue(chat.title)
                setIsEditing(false)
              }
            }}
            onBlur={commitRename}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span
            className="text-sm truncate flex-1 translate-y-[-0.5px]"
            onDoubleClick={(event) => {
              event.stopPropagation()
              startEditing()
            }}
          >
            {chat.status !== "idle" && chat.status !== "waiting_for_user" ? (
              <AnimatedShinyText
                animate={chat.status === "running"}
                shimmerWidth={Math.max(20, chat.title.length * 3)}
              >
                {chat.title}
              </AnimatedShinyText>
            ) : (
              chat.title
            )}
          </span>
        )}
        <div className="relative h-7 w-7 mr-[2px] shrink-0">
          {ageLabel ? (
            <span className="hidden md:flex absolute inset-0 items-center justify-end pr-1 text-[11px] text-muted-foreground opacity-50 transition-opacity group-hover:opacity-0">
              {ageLabel}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute inset-0 h-7 w-7 opacity-100 cursor-pointer rounded-sm hover:!bg-transparent !border-0",
              ageLabel
                ? "md:opacity-0 md:group-hover:opacity-100"
                : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
            )}
            onClick={(event) => {
              event.stopPropagation()
              onDeleteChat(chat.chatId)
            }}
            title="Delete chat"
          >
            <Archive className="size-3.5" />
          </Button>
        </div>
      </div>
    </ChatRowMenu>
  )
}
