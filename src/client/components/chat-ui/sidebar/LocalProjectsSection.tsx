import { type ReactNode, useMemo, useState } from "react"
import { ChevronRight, FolderOpen } from "lucide-react"
import type { AgentProvider, DiscoveredSession } from "../../../../shared/types"
import { SessionPickerContent, getSessionPickerUiIdentityDescriptors } from "../SessionPicker"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import type { SidebarChatRow, SidebarWorkspaceGroup } from "../../../../shared/types"
import { getPathBasename } from "../../../lib/formatters"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../../lib/uiIdentityOverlay"
import { cn } from "../../../lib/utils"
import { ProjectSectionMenu } from "./Menus"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogGhostButton,
  DialogHeader,
  DialogTitle,
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
  RESPONSIVE_MODAL_HEADER_CLASS_NAME,
} from "../../ui/dialog"

const PROJECT_GROUP_UI_ID = "sidebar.project-group"
const PROJECT_GROUP_DESCRIPTOR = createUiIdentityDescriptor({
  id: PROJECT_GROUP_UI_ID,
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
  onOpenCoordination?: (workspaceId: string) => void
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
  onOpenCoordination?: (workspaceId: string) => void
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
  onOpenCoordination,
}: ProjectGroupSectionProps) {
  const { groupKey, localPath, chats: pathChats } = group
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false)
  const [sessionSearchQuery, setSessionSearchQuery] = useState("")

  const sidebarChatIds = useMemo(
    () => new Set(pathChats.map((chat) => chat.chatId)),
    [pathChats]
  )

  const isExpanded = expandedGroups.has(groupKey)
  const displayChats = isExpanded ? pathChats : pathChats.slice(0, chatsPerProject)
  const hasMore = pathChats.length > chatsPerProject
  const isConnectedDisabled = isConnected === false
  const isStartingCurrentPath = startingLocalPath === localPath
  const sessionPickerUiDescriptors = getSessionPickerUiIdentityDescriptors()
  const hasMenuActions = Boolean(
    onOpenSessionPicker
    || onMergeSession
    || onOpenCoordination
    || onNewLocalChat
    || onRemoveProject
  )

  function handleSessionDialogOpenChange(next: boolean) {
    setIsSessionDialogOpen(next)
    if (!next) {
      setSessionSearchQuery("")
    }
    onOpenSessionPicker?.(groupKey, next)
  }

  function handleSelectSession(session: DiscoveredSession) {
    if (session.chatId) {
      onNavigateToChat?.(session.chatId)
    } else {
      onResumeSession?.(groupKey, session.sessionId, session.provider)
    }
    handleSessionDialogOpenChange(false)
  }

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
    </div>
  )

  return (
    <div
      {...getUiIdentityAttributeProps(PROJECT_GROUP_DESCRIPTOR)}
      className="group/section"
    >
      {hasMenuActions ? (
        <ProjectSectionMenu
          onOpenSessions={onOpenSessionPicker ? () => handleSessionDialogOpenChange(true) : undefined}
          sessionsDisabled={isConnectedDisabled}
          onMergeSession={onMergeSession ? () => onMergeSession(groupKey) : undefined}
          mergeDisabled={isConnectedDisabled}
          onOpenCoordination={onOpenCoordination ? () => onOpenCoordination(groupKey) : undefined}
          onNewChat={onNewLocalChat ? () => onNewLocalChat(localPath) : undefined}
          newChatDisabled={isConnectedDisabled || isStartingCurrentPath}
          onRemove={onRemoveProject ? () => onRemoveProject(groupKey) : undefined}
        >
          {header}
        </ProjectSectionMenu>
      ) : header}
      <Dialog open={isSessionDialogOpen} onOpenChange={handleSessionDialogOpenChange}>
        <DialogContent
          size="sm"
          className={RESPONSIVE_MODAL_CONTENT_CLASS_NAME}
          {...getUiIdentityAttributeProps(sessionPickerUiDescriptors.dialog)}
        >
          <DialogHeader className={RESPONSIVE_MODAL_HEADER_CLASS_NAME}>
            <DialogTitle>Sessions</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 pt-3.5 flex min-h-0 flex-1 flex-col overflow-hidden">
            <SessionPickerContent
              sessions={sessions ?? []}
              windowDays={sessionsWindowDays ?? 7}
              searchQuery={sessionSearchQuery}
              onSelectSession={handleSelectSession}
              onRefresh={() => onRefreshSessions?.(groupKey)}
              onSearchChange={setSessionSearchQuery}
              onShowMore={() => onShowMoreSessions?.(groupKey)}
              isRefreshing={false}
              sidebarChatIds={sidebarChatIds}
            />
          </div>
          <DialogFooter className={RESPONSIVE_MODAL_FOOTER_CLASS_NAME}>
            <DialogGhostButton onClick={() => handleSessionDialogOpenChange(false)}>
              Close
            </DialogGhostButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!collapsedSections.has(groupKey) && (displayChats.length > 0 || hasMore) && (
        <div className="space-y-[2px] mb-2 ">
          {displayChats.map(renderChatRow)}
          {hasMore && (
            <Button
              variant="link"
              size="sm"
              onClick={() => onToggleExpandedGroup(groupKey)}
              className="pl-2.5 py-1 text-xs text-muted-foreground h-auto"
            >
              {isExpanded ? "Show less" : `Show more (${pathChats.length - chatsPerProject})`}
            </Button>
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
  onOpenCoordination,
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
          onOpenCoordination={onOpenCoordination}
        />
      ))}
    </>
  )
}
