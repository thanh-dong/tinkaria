import { useState } from "react"
import { GitFork, Menu, PanelLeft } from "lucide-react"
import { Button } from "../ui/button"
import { CardHeader } from "../ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"
import { createUiIdentity, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
import type { CurrentRepoStatusSnapshot, DiscoveredSessionRuntime, TinkariaStatus } from "../../../shared/types"
import { PROVIDER_ICONS, getProviderFromModel } from "../icons/ProviderIcons"

interface Props {
  sidebarCollapsed: boolean
  onOpenSidebar: () => void
  onCollapseSidebar: () => void
  onExpandSidebar: () => void
  onForkSession: () => void
  localPath?: string
  currentSessionRuntime?: DiscoveredSessionRuntime | null
  currentRepoStatus?: CurrentRepoStatusSnapshot | null
  chatTitle?: string
  chatStatus?: TinkariaStatus
}

function getPathLabel(localPath: string | undefined, repoStatus: CurrentRepoStatusSnapshot | null | undefined): string | null {
  const source = repoStatus?.localPath ?? localPath
  if (!source) return null
  const parts = source.split("/").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : source
}

function getCompactRepoLabel(
  pathLabel: string | null,
  repoStatus: CurrentRepoStatusSnapshot | null | undefined
): string | null {
  if (!pathLabel) return null

  const parts = [pathLabel]
  if (repoStatus?.branch) {
    let branchPart = repoStatus.branch
    if (repoStatus.ahead > 0) branchPart += ` +${repoStatus.ahead}`
    if (repoStatus.behind > 0) branchPart += ` -${repoStatus.behind}`
    parts.push(branchPart)
  }

  return parts.join(" \u00b7 ")
}

export function getContextBarColor(percent: number): string {
  if (percent >= 90) return "bg-red-500 dark:bg-red-400"
  if (percent >= 75) return "bg-orange-500 dark:bg-orange-400"
  if (percent >= 50) return "bg-amber-500 dark:bg-amber-400"
  return "bg-emerald-500 dark:bg-emerald-400"
}

export function getContextPercentTextColor(percent: number): string {
  if (percent >= 90) return "text-red-600 dark:text-red-400"
  if (percent >= 75) return "text-orange-600 dark:text-orange-400"
  if (percent >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

function RepoDetailPopover({
  localPath,
  repoStatus,
  compactLabel,
}: {
  localPath?: string
  repoStatus: CurrentRepoStatusSnapshot | null | undefined
  compactLabel: string
}) {
  const [open, setOpen] = useState(false)
  const fullPath = repoStatus?.localPath ?? localPath

  const hasDetails = Boolean(fullPath || repoStatus?.branch || repoStatus?.isRepo)
  if (!hasDetails) {
    return (
      <span className="truncate text-[11px] leading-none text-muted-foreground" title={compactLabel}>
        {compactLabel}
      </span>
    )
  }

  const changeCount = (repoStatus?.stagedCount ?? 0) + (repoStatus?.unstagedCount ?? 0) + (repoStatus?.untrackedCount ?? 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="truncate text-[11px] leading-none text-muted-foreground hover:text-foreground transition-colors cursor-default"
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
        >
          {compactLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-auto min-w-48 max-w-72 p-2.5"
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-1.5 text-[11px] leading-relaxed">
          {fullPath ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Path</span>
              <span className="text-foreground font-medium truncate">{fullPath}</span>
            </div>
          ) : null}
          {repoStatus?.branch ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Branch</span>
              <span className="text-foreground font-medium">{repoStatus.branch}</span>
            </div>
          ) : null}
          {(repoStatus?.ahead ?? 0) > 0 || (repoStatus?.behind ?? 0) > 0 ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Sync</span>
              <span className="text-foreground font-medium">
                {repoStatus!.ahead > 0 ? `+${repoStatus!.ahead} ahead` : null}
                {repoStatus!.ahead > 0 && repoStatus!.behind > 0 ? ", " : null}
                {repoStatus!.behind > 0 ? `-${repoStatus!.behind} behind` : null}
              </span>
            </div>
          ) : null}
          {changeCount > 0 ? (
            <div className="flex gap-2">
              <span className="text-muted-foreground shrink-0">Changes</span>
              <span className="text-foreground font-medium">
                {[
                  repoStatus!.stagedCount > 0 ? `${repoStatus!.stagedCount} staged` : null,
                  repoStatus!.unstagedCount > 0 ? `${repoStatus!.unstagedCount} modified` : null,
                  repoStatus!.untrackedCount > 0 ? `${repoStatus!.untrackedCount} untracked` : null,
                ].filter(Boolean).join(", ")}
              </span>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getStatusDotClass(status: TinkariaStatus | undefined): string {
  switch (status) {
    case "running":
    case "starting":
      return "bg-emerald-500 animate-pulse"
    case "waiting_for_user":
      return "bg-amber-500"
    case "failed":
      return "bg-red-500"
    default:
      return "bg-muted-foreground/40"
  }
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
  chatTitle,
  chatStatus,
}: Props) {
  const navbarAreaId = createUiIdentity("chat.navbar", "area")
  const forkSessionActionId = createUiIdentity("chat.navbar.fork-session", "action")
  const pathLabel = getPathLabel(localPath, currentRepoStatus)
  const compactRepoLabel = getCompactRepoLabel(pathLabel, currentRepoStatus)
  const contextPercent = currentSessionRuntime?.tokenUsage?.estimatedContextPercent
  const modelName = currentSessionRuntime?.model
  const provider = modelName ? getProviderFromModel(modelName) : null
  const ProviderIcon = provider ? PROVIDER_ICONS[provider] : null

  const hasRightContent = Boolean(compactRepoLabel || contextPercent !== undefined)

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
        {/* Left pill: sidebar toggle + fork + model icon */}
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
          {ProviderIcon && modelName ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center size-8 rounded-full text-muted-foreground" data-testid="model-indicator">
                  <ProviderIcon className="size-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                {modelName}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {/* Center: session title (always visible, compact on mobile when sidebar open) */}
        {chatTitle ? (
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1"
            data-testid="session-summary"
            data-status={chatStatus ?? "idle"}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", getStatusDotClass(chatStatus))} />
            <span className={cn(
              "truncate text-[11px] leading-none text-muted-foreground",
              !sidebarCollapsed && "max-md:max-w-[120px]"
            )}>
              {chatTitle}
            </span>
          </div>
        ) : null}

        {/* Right pill: compact repo + context bar */}
        <div className="flex min-w-0 flex-1 justify-end">
          {hasRightContent ? (
            <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/80 bg-background/78 px-2.5 py-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
              {compactRepoLabel ? (
                <RepoDetailPopover
                  localPath={localPath}
                  repoStatus={currentRepoStatus}
                  compactLabel={compactRepoLabel}
                />
              ) : null}

              {contextPercent !== undefined ? (
                <div className="flex items-center gap-1.5 shrink-0" data-testid="context-bar">
                  <span className={cn("text-[10px] font-medium leading-none tabular-nums", getContextPercentTextColor(contextPercent))}>
                    {contextPercent}%
                  </span>
                  <div className="w-12 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", getContextBarColor(contextPercent))}
                      style={{ width: `${Math.min(100, Math.max(0, contextPercent))}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}
