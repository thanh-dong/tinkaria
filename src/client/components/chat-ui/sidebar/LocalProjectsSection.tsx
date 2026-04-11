import { type ReactNode, useMemo } from "react"
import { ChevronRight, FolderOpen, Loader2, Merge, SquarePen } from "lucide-react"
import type { AgentProvider, DiscoveredSession } from "../../../../shared/types"
import { SessionPicker } from "../SessionPicker"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import type { SidebarChatRow, SidebarWorkspaceGroup } from "../../../../shared/types"
import { APP_NAME } from "../../../../shared/branding"
import { getPathBasename } from "../../../lib/formatters"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../../lib/uiIdentityOverlay"
import { cn } from "../../../lib/utils"
import { ProjectSectionMenu } from "./Menus"

const PROJECT_GROUP_UI_ID = "sidebar.project-group"
const PROJECT_GROUP_DESCRIPTOR = createUiIdentityDescriptor({
  id: PROJECT_GROUP_UI_ID,
  c3ComponentId: "c3-113",
  c3ComponentLabel: "sidebar",
})

const MERGE_SESSION_DESCRIPTOR = createUiIdentityDescriptor({
  id: "sidebar.project-group.merge-session",
  c3ComponentId: "c3-113",
  c3ComponentLabel: "sidebar",
})

interface Props {
  workspaceGroups: SidebarWorkspaceGroup[]
  collapsedSections: Set<string>
  expandedGroups: Set<string>
  onToggleSection: (key: string) => void
  onToggleExpandedGroup: (key: string) => void
  renderChatRow: (chat: SidebarChatRow) => ReactNode
  chatsPerProject: number
  onNewLocalChat?: (localPath: string) => void
  onRemoveProject?: (workspaceId: string) => void
  isConnected?: boolean
  startingLocalPath?: string | null
  sessionsForProject?: (workspaceId: string) => DiscoveredSession[]
  sessionsWindowDaysForProject?: (workspaceId: string) => number
  onOpenSessionPicker?: (workspaceId: string, open: boolean) => void
  onNavigateToChat?: (chatId: string) => void
  onResumeSession?: (workspaceId: string, sessionId: string, provider: AgentProvider) => void
  onRefreshSessions?: (workspaceId: string) => void
  onShowMoreSessions?: (workspaceId: string) => void
  onMergeSession?: (workspaceId: string) => void
}

interface ProjectGroupSectionProps {
  group: SidebarWorkspaceGroup
  collapsedSections: Set<string>
  expandedGroups: Set<string>
  onToggleSection: (key: string) => void
  onToggleExpandedGroup: (key: string) => void
  renderChatRow: (chat: SidebarChatRow) => ReactNode
  chatsPerProject: number
  onNewLocalChat?: (localPath: string) => void
  onRemoveProject?: (workspaceId: string) => void
  isConnected?: boolean
  startingLocalPath?: string | null
  sessions?: DiscoveredSession[]
  sessionsWindowDays?: number
  onOpenSessionPicker?: (workspaceId: string, open: boolean) => void
  onNavigateToChat?: (chatId: string) => void
  onResumeSession?: (workspaceId: string, sessionId: string, provider: AgentProvider) => void
  onRefreshSessions?: (workspaceId: string) => void
  onShowMoreSessions?: (workspaceId: string) => void
  onMergeSession?: (workspaceId: string) => void
}

function ProjectGroupSection({
  group,
  collapsedSections,
  expandedGroups,
  onToggleSection,
  onToggleExpandedGroup,
  renderChatRow,
  chatsPerProject,
  onNewLocalChat,
  onRemoveProject,
  isConnected,
  startingLocalPath,
  sessions,
  sessionsWindowDays,
  onOpenSessionPicker,
  onNavigateToChat,
  onResumeSession,
  onRefreshSessions,
  onShowMoreSessions,
  onMergeSession,
}: ProjectGroupSectionProps) {
  const { groupKey, localPath, chats: pathChats } = group

  const sidebarChatIds = useMemo(
    () => new Set(pathChats.map((chat) => chat.chatId)),
    [pathChats]
  )

  const isExpanded = expandedGroups.has(groupKey)
  const displayChats = isExpanded ? pathChats : pathChats.slice(0, chatsPerProject)
  const hasMore = pathChats.length > chatsPerProject

  const header = (
    <div
      className={cn(
        "sticky top-0 bg-background dark:bg-card z-10 relative p-[10px] flex items-center justify-between"
      )}
      onClick={() => onToggleSection(groupKey)}
    >
      <div className="flex items-center gap-2">
        <span className="relative size-3.5 shrink-0 cursor-pointer">
          {collapsedSections.has(groupKey) ? (
            <ChevronRight className="translate-y-[1px] size-3.5 shrink-0 text-slate-400 transition-all duration-200" />
          ) : (
            <>
              <FolderOpen className="absolute inset-0 translate-y-[1px] size-3.5 shrink-0 text-slate-400 dark:text-slate-500 transition-all duration-200 group-hover/section:opacity-0" />
              <ChevronRight className="absolute inset-0 translate-y-[1px] size-3.5 shrink-0 rotate-90 text-slate-400 opacity-0 transition-all duration-200 group-hover/section:opacity-100" />
            </>
          )}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate max-w-[150px] whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
              {getPathBasename(localPath)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={4}>
            {localPath}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="absolute right-2 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {onOpenSessionPicker && (
          <SessionPicker
            sessions={sessions ?? []}
            isLoading={false}
            windowDays={sessionsWindowDays ?? 7}
            sidebarChatIds={sidebarChatIds}
            onSelectSession={(session) => {
              if (session.chatId) {
                onNavigateToChat?.(session.chatId)
              } else {
                onResumeSession?.(groupKey, session.sessionId, session.provider)
              }
            }}
            onRefresh={() => onRefreshSessions?.(groupKey)}
            onShowMore={() => onShowMoreSessions?.(groupKey)}
            onOpenChange={(open) => onOpenSessionPicker(groupKey, open)}
            disabled={!isConnected}
          />
        )}
        {onMergeSession && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                {...getUiIdentityAttributeProps(MERGE_SESSION_DESCRIPTOR)}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-5.5 w-5.5 !rounded opacity-100 md:opacity-0 md:group-hover/section:opacity-100",
                  !isConnected && "opacity-50 cursor-not-allowed"
                )}
                disabled={!isConnected}
                onClick={(event) => {
                  event.stopPropagation()
                  onMergeSession(groupKey)
                }}
              >
                <Merge className="size-3.5 text-slate-500 dark:text-slate-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              {!isConnected ? `Start ${APP_NAME} to connect` : "Merge sessions"}
            </TooltipContent>
          </Tooltip>
        )}
        {onNewLocalChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-5.5 w-5.5 !rounded opacity-100 md:opacity-0 md:group-hover/section:opacity-100",
                  (!isConnected || startingLocalPath === localPath) && "opacity-50 cursor-not-allowed"
                )}
                disabled={!isConnected || startingLocalPath === localPath}
                onClick={(event) => {
                  event.stopPropagation()
                  onNewLocalChat(localPath)
                }}
              >
                {startingLocalPath === localPath ? (
                  <Loader2 className="size-4 text-slate-500 dark:text-slate-400 animate-spin" />
                ) : (
                  <SquarePen className="size-3.5 text-slate-500 dark:text-slate-400" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              {!isConnected ? `Start ${APP_NAME} to connect` : "New chat"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )

  return (
    <div
      {...getUiIdentityAttributeProps(PROJECT_GROUP_DESCRIPTOR)}
      className="group/section"
    >
      {onRemoveProject ? (
        <ProjectSectionMenu onRemove={() => onRemoveProject(groupKey)}>
          {header}
        </ProjectSectionMenu>
      ) : header}

      {!collapsedSections.has(groupKey) && (displayChats.length > 0 || hasMore) && (
        <div className="space-y-[2px] mb-2 ">
          {displayChats.map(renderChatRow)}
          {hasMore && (
            <button
              onClick={() => onToggleExpandedGroup(groupKey)}
              className="pl-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? "Show less" : `Show more (${pathChats.length - chatsPerProject})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function LocalProjectsSection({
  workspaceGroups,
  collapsedSections,
  expandedGroups,
  onToggleSection,
  onToggleExpandedGroup,
  renderChatRow,
  chatsPerProject,
  onNewLocalChat,
  onRemoveProject,
  isConnected,
  startingLocalPath,
  sessionsForProject,
  sessionsWindowDaysForProject,
  onOpenSessionPicker,
  onNavigateToChat,
  onResumeSession,
  onRefreshSessions,
  onShowMoreSessions,
  onMergeSession,
}: Props) {
  return (
    <>
      {workspaceGroups.map((group) => (
        <ProjectGroupSection
          key={group.groupKey}
          group={group}
          collapsedSections={collapsedSections}
          expandedGroups={expandedGroups}
          onToggleSection={onToggleSection}
          onToggleExpandedGroup={onToggleExpandedGroup}
          renderChatRow={renderChatRow}
          chatsPerProject={chatsPerProject}
          onNewLocalChat={onNewLocalChat}
          onRemoveProject={onRemoveProject}
          isConnected={isConnected}
          startingLocalPath={startingLocalPath}
          sessions={sessionsForProject?.(group.groupKey)}
          sessionsWindowDays={sessionsWindowDaysForProject?.(group.groupKey)}
          onOpenSessionPicker={onOpenSessionPicker}
          onNavigateToChat={onNavigateToChat}
          onResumeSession={onResumeSession}
          onRefreshSessions={onRefreshSessions}
          onShowMoreSessions={onShowMoreSessions}
          onMergeSession={onMergeSession}
        />
      ))}
    </>
  )
}
