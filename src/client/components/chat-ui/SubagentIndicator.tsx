import { memo, useCallback, useMemo, useState } from "react"
import { ChevronRight, X } from "lucide-react"
import { cn } from "../../lib/utils"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import type { OrchestrationChildStatus, OrchestrationChildNode, OrchestrationHierarchySnapshot } from "../../../shared/types"

// -- Helpers ----------------------------------------------------------------

const STATUS_CONFIG: Record<OrchestrationChildStatus, {
  dot: string
  label: string
  pulse: boolean
}> = {
  spawning: { dot: "bg-amber-400", label: "Spawning", pulse: true },
  running:  { dot: "bg-emerald-400", label: "Running", pulse: true },
  waiting:  { dot: "bg-sky-400", label: "Waiting", pulse: true },
  completed:{ dot: "bg-neutral-400 dark:bg-neutral-500", label: "Done", pulse: false },
  failed:   { dot: "bg-red-400", label: "Failed", pulse: false },
  closed:   { dot: "bg-neutral-300 dark:bg-neutral-600", label: "Closed", pulse: false },
}

function isActiveStatus(status: OrchestrationChildStatus): boolean {
  return status === "spawning" || status === "running" || status === "waiting"
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m${seconds > 0 ? `${seconds}s` : ""}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`
}

function countNodes(nodes: OrchestrationChildNode[]): { total: number; active: number; failed: number } {
  let total = 0
  let active = 0
  let failed = 0
  for (const node of nodes) {
    total += 1
    if (isActiveStatus(node.status)) active += 1
    if (node.status === "failed") failed += 1
    const sub = countNodes(node.children)
    total += sub.total
    active += sub.active
    failed += sub.failed
  }
  return { total, active, failed }
}

function allTerminal(nodes: OrchestrationChildNode[]): boolean {
  return nodes.every((n) => !isActiveStatus(n.status) && allTerminal(n.children))
}

// -- UI Identity ------------------------------------------------------------

const INDICATOR_DESCRIPTORS = {
  root: createUiIdentityDescriptor({
    id: "chat.composer.subagents.indicator",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
  toggle: createUiIdentityDescriptor({
    id: "chat.composer.subagents.toggle",
    c3ComponentId: "c3-112",
    c3ComponentLabel: "chat-input",
  }),
}

// -- StatusDot --------------------------------------------------------------

function StatusDot({ status, size = "sm" }: { status: OrchestrationChildStatus; size?: "sm" | "xs" }) {
  const config = STATUS_CONFIG[status]
  const sizeClass = size === "sm" ? "h-2 w-2" : "h-1.5 w-1.5"
  return (
    <span className="relative inline-flex items-center justify-center">
      {config.pulse ? (
        <span
          className={cn(
            "absolute inline-flex rounded-full opacity-60 animate-ping",
            config.dot,
            sizeClass,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex rounded-full", config.dot, sizeClass)} />
    </span>
  )
}

// -- TreeNode ---------------------------------------------------------------

function TreeNode({
  node,
  isLast,
  depth,
  nowMs,
}: {
  node: OrchestrationChildNode
  isLast: boolean
  depth: number
  nowMs: number
}) {
  const config = STATUS_CONFIG[node.status]
  const elapsed = formatElapsed(nowMs - node.spawnedAt)
  const isTerminal = !isActiveStatus(node.status)

  return (
    <div className="relative">
      {/* Connector lines */}
      {depth > 0 ? (
        <>
          {/* Vertical line from parent */}
          <span
            className={cn(
              "absolute left-0 top-0 w-px bg-border",
              isLast ? "h-[11px]" : "h-full",
            )}
            style={{ left: `${(depth - 1) * 16 + 4}px` }}
          />
          {/* Horizontal branch */}
          <span
            className="absolute top-[11px] h-px bg-border"
            style={{
              left: `${(depth - 1) * 16 + 4}px`,
              width: "8px",
            }}
          />
        </>
      ) : null}

      <div
        className={cn(
          "flex items-center gap-1.5 py-[3px] text-xs",
          isTerminal && "opacity-50",
        )}
        style={{ paddingLeft: `${depth * 16 + (depth > 0 ? 14 : 0)}px` }}
      >
        <StatusDot status={node.status} size="xs" />
        <span
          className="truncate text-foreground/80 max-w-[180px]"
          title={node.instruction}
        >
          {node.instruction}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {elapsed}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium tracking-wide uppercase",
            node.status === "failed" ? "text-red-400" : "text-muted-foreground",
          )}
        >
          {config.label}
        </span>
      </div>

      {node.children.length > 0 ? (
        <div>
          {node.children.map((child, index) => (
            <TreeNode
              key={child.chatId}
              node={child}
              isLast={index === node.children.length - 1}
              depth={depth + 1}
              nowMs={nowMs}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// -- Main component ---------------------------------------------------------

interface SubagentIndicatorProps {
  hierarchy: OrchestrationHierarchySnapshot | null
  className?: string
}

export const SubagentIndicator = memo(function SubagentIndicator({
  hierarchy,
  className,
}: SubagentIndicatorProps) {
  const [expanded, setExpanded] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Tick elapsed time every second when expanded
  const startTicking = useCallback(() => {
    setNowMs(Date.now())
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const handleToggle = useCallback(() => {
    setExpanded((prev) => {
      if (!prev) startTicking()
      return !prev
    })
  }, [startTicking])

  const counts = useMemo(() => {
    if (!hierarchy || hierarchy.children.length === 0) return null
    return countNodes(hierarchy.children)
  }, [hierarchy])

  const pillDots = useMemo(() => {
    if (!hierarchy) return []
    return hierarchy.children.map((child) => child.status)
  }, [hierarchy])

  // Nothing to show
  if (!counts || !hierarchy) return null

  // Auto-collapse when everything is terminal
  const shouldAutoCollapse = allTerminal(hierarchy.children)

  return (
    <div
      {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.root)}
      className={cn(
        "transition-all duration-300 ease-out",
        shouldAutoCollapse && !expanded && "opacity-40 hover:opacity-80",
        className,
      )}
    >
      {/* Collapsed pill */}
      <button
        type="button"
        onClick={handleToggle}
        {...getUiIdentityAttributeProps(INDICATOR_DESCRIPTORS.toggle)}
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          "hover:bg-muted/60 cursor-pointer",
          expanded
            ? "text-foreground/80"
            : "text-muted-foreground",
        )}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform duration-200 text-muted-icon",
            expanded && "rotate-90",
          )}
        />

        {/* Status dots cluster */}
        <span className="flex items-center gap-0.5">
          {pillDots.map((status, index) => (
            <StatusDot key={index} status={status} size="sm" />
          ))}
        </span>

        <span className="tabular-nums">
          {counts.active > 0
            ? `${counts.active} running`
            : `${counts.total} agent${counts.total === 1 ? "" : "s"}`}
          {counts.failed > 0 ? (
            <span className="text-red-400 ml-1">
              {counts.failed} failed
            </span>
          ) : null}
        </span>
      </button>

      {/* Expanded tree */}
      {expanded && !shouldAutoCollapse ? (
        <div className="mt-1 rounded-lg border border-border/60 bg-card/50 backdrop-blur-sm px-2 py-1.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-medium">
              Subagents
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {hierarchy.children.map((child, index) => (
            <TreeNode
              key={child.chatId}
              node={child}
              isLast={index === hierarchy.children.length - 1}
              depth={0}
              nowMs={nowMs}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
})
