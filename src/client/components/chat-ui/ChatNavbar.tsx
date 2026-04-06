import { GitFork, Menu, PanelLeft } from "lucide-react"
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
  onForkSession: () => void
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
    if (dirtyParts.length > 0) {
      labels.push(dirtyParts.join(" "))
    }
  }

  return labels
}

function getPrimaryRuntimeLabel(runtime: DiscoveredSessionRuntime | null | undefined): string | null {
  if (runtime?.tokenUsage?.estimatedContextPercent !== undefined) {
    return `~${runtime.tokenUsage.estimatedContextPercent}% ctx`
  }

  const labels = getRuntimeLabels(runtime)
  return labels[0] ?? null
}

export function ChatNavbar({
  sidebarCollapsed,
  onOpenSidebar,
  onCollapseSidebar,
  onExpandSidebar,
  onForkSession,
  localPath,
  currentSessionRuntime,
  currentRepoStatus,
  accountInfo,
}: Props) {
  const navbarAreaId = createUiIdentity("chat.navbar", "area")
  const forkSessionActionId = createUiIdentity("chat.navbar.fork-session", "action")
  const pathLabel = getPathLabel(localPath, currentRepoStatus)
  const repoLabels = getRepoLabels(currentRepoStatus)
  const primaryRuntimeLabel = getPrimaryRuntimeLabel(currentSessionRuntime)
  const secondaryStatusLabels = [
    ...(pathLabel ? [pathLabel] : []),
    ...repoLabels,
    ...(accountInfo?.subscriptionType && !primaryRuntimeLabel ? [accountInfo.subscriptionType] : []),
  ]

  return (
    <CardHeader
      {...getUiIdentityAttributeProps("chat.navbar")}
      className={cn(
        "absolute top-0 left-0 right-0 z-10 px-3 pt-3 border-border/0 flex items-center justify-center",
        "bg-gradient-to-b from-background/80 via-background/55 to-transparent"
      )}
    >
      <div
        {...getUiIdentityAttributeProps(navbarAreaId)}
        className="relative flex items-center gap-2 w-full"
      >
        <div className="flex items-center gap-1 flex-shrink-0 rounded-full border border-border/80 bg-background/78 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={sidebarCollapsed ? onExpandSidebar : onCollapseSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft className="size-4.5" />
          </Button>
          <Button
            {...getUiIdentityAttributeProps(forkSessionActionId)}
            variant="ghost"
            size="icon"
            onClick={onForkSession}
            title="Fork session"
          >
            <GitFork className="size-4.5" />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 justify-end">
          {(secondaryStatusLabels.length > 0 || primaryRuntimeLabel) ? (
            <div className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border/80 bg-background/78 pl-2 pr-1.5 py-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
              {secondaryStatusLabels.length > 0 ? (
                <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                  {secondaryStatusLabels.map((label, index) => (
                    <div key={label} className="flex min-w-0 items-center gap-1">
                      {index > 0 ? (
                        <span className="text-[10px] leading-none text-muted-foreground/45" aria-hidden="true">
                          /
                        </span>
                      ) : null}
                      <span
                        className="truncate text-[11px] leading-none text-muted-foreground"
                        title={label}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {primaryRuntimeLabel ? (
                <span
                  className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-medium leading-none text-background"
                  title={primaryRuntimeLabel}
                >
                  {primaryRuntimeLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}
