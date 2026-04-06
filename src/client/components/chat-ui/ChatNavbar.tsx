import { Menu, PanelLeft, SquarePen } from "lucide-react"
import { TinkariaSidebarMark } from "../branding/TinkariaSidebarMark"
import { Button } from "../ui/button"
import { CardHeader } from "../ui/card"
import { createUiIdentity, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
import type { AccountInfo, CurrentRepoStatusSnapshot, DiscoveredSessionRuntime } from "../../../shared/types"
import { getRuntimeLabels } from "./SessionRuntimeBadges"

interface Props {
  sidebarCollapsed: boolean
  onOpenSidebar: () => void
  onCollapseSidebar: () => void
  onExpandSidebar: () => void
  onNewChat: () => void
  localPath?: string
  currentSessionRuntime?: DiscoveredSessionRuntime | null
  currentRepoStatus?: CurrentRepoStatusSnapshot | null
  accountInfo?: AccountInfo | null
}

function getPathLabel(localPath: string | undefined, repoStatus: CurrentRepoStatusSnapshot | null | undefined): string | null {
  const source = repoStatus?.localPath ?? localPath
  if (!source) return null
  const parts = source.split("/").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : source
}

function getRepoLabels(repoStatus: CurrentRepoStatusSnapshot | null | undefined): string[] {
  if (!repoStatus) return []

  const labels: string[] = []
  if (repoStatus.branch) {
    let branchLabel = repoStatus.branch
    if (repoStatus.ahead > 0 || repoStatus.behind > 0) {
      const parts = []
      if (repoStatus.ahead > 0) parts.push(`+${repoStatus.ahead}`)
      if (repoStatus.behind > 0) parts.push(`-${repoStatus.behind}`)
      branchLabel += ` ${parts.join("/")}`
    }
    labels.push(branchLabel)
  }

  if (repoStatus.isRepo) {
    const dirtyParts = []
    if (repoStatus.stagedCount > 0) dirtyParts.push(`S${repoStatus.stagedCount}`)
    if (repoStatus.unstagedCount > 0) dirtyParts.push(`M${repoStatus.unstagedCount}`)
    if (repoStatus.untrackedCount > 0) dirtyParts.push(`?${repoStatus.untrackedCount}`)
    labels.push(dirtyParts.length > 0 ? dirtyParts.join(" ") : "clean")
  }

  return labels
}

export function ChatNavbar({
  sidebarCollapsed,
  onOpenSidebar,
  onCollapseSidebar,
  onExpandSidebar,
  onNewChat,
  localPath,
  currentSessionRuntime,
  currentRepoStatus,
  accountInfo,
}: Props) {
  const navbarAreaId = createUiIdentity("chat.navbar", "area")
  const newChatActionId = createUiIdentity("chat.navbar.new-chat", "action")
  const currentSessionLabels = [
    ...(getPathLabel(localPath, currentRepoStatus) ? [getPathLabel(localPath, currentRepoStatus)!] : []),
    ...getRepoLabels(currentRepoStatus),
    ...(accountInfo?.subscriptionType ? [accountInfo.subscriptionType] : []),
    ...getRuntimeLabels(currentSessionRuntime ?? null),
  ]

  return (
    <CardHeader
      {...getUiIdentityAttributeProps("chat.navbar")}
      className={cn(
        "absolute top-0 left-0 right-0 z-10 md:pt-3 px-3 border-border/0 md:pb-0 flex items-center justify-center",
        " bg-gradient-to-b from-background/70"
      )}
    >
      <div
        {...getUiIdentityAttributeProps(navbarAreaId)}
        className="relative flex items-center gap-2 w-full"
      >
        <div className={`flex items-center gap-1 flex-shrink-0 border border-border rounded-full ${sidebarCollapsed ? "px-1.5" : ""} p-1 backdrop-blur-lg`}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4.5" />
          </Button>
          {sidebarCollapsed ? (
            <>
              <div className="flex items-center justify-center w-[36px] h-[36px]">
                <TinkariaSidebarMark className="hidden h-5 w-5 md:inline-flex sm:h-6 sm:w-6" imageClassName="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex"
                onClick={onExpandSidebar}
                title="Expand sidebar"
              >
                <PanelLeft className="size-4.5" />
              </Button>
            </>
          ) : null}
          {!sidebarCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={onCollapseSidebar}
              title="Collapse sidebar"
            >
              <PanelLeft className="size-4.5" />
            </Button>
          ) : null}
          <Button
            {...getUiIdentityAttributeProps(newChatActionId)}
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            title="Compose"
          >
            <SquarePen className="size-4.5" />
          </Button>
        </div>

        <div className="flex-1 min-w-0 flex justify-center px-2">
          {currentSessionLabels.length > 0 ? (
            <div className="hidden min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full border border-border px-2 py-1 backdrop-blur-lg md:flex">
              {currentSessionLabels.map((label) => (
                <span
                  key={label}
                  className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] leading-none text-muted-foreground"
                  title={label}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}
