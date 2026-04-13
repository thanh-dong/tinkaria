import { type ReactNode } from "react"
import { ChevronRight, FolderOpen } from "lucide-react"
import type { SidebarChatRow, SidebarWorkspaceGroup } from "../../../../shared/types"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
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
  onMergeSession,
  onOpenCoordination,
}: ProjectGroupSectionProps) {
  const { groupKey, localPath, chats: pathChats } = group

  const isExpanded = expandedGroups.has(groupKey)
  const displayChats = isExpanded ? pathChats : pathChats.slice(0, chatsPerProject)
  const hasMore = pathChats.length > chatsPerProject
  const isConnectedDisabled = isConnected === false
  const isStartingCurrentPath = startingLocalPath === localPath
  const hasMenuActions = Boolean(
    onMergeSession
    || onOpenCoordination
    || onNewLocalChat
    || onRemoveProject
  )

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
          onMergeSession={onMergeSession}
          onOpenCoordination={onOpenCoordination}
        />
      ))}
    </>
  )
}
