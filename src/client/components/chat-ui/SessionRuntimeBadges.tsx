import type { DiscoveredSessionRuntime } from "../../../shared/types"

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export function getRuntimeLabels(runtime: DiscoveredSessionRuntime | null | undefined): string[] {
  const labels: string[] = []

  if (runtime?.model) {
    labels.push(runtime.model)
  }

  if (runtime?.tokenUsage?.estimatedContextPercent !== undefined) {
    labels.push(`~${runtime.tokenUsage.estimatedContextPercent}% ctx`)
  }

  if (runtime?.tokenUsage?.totalTokens !== undefined) {
    labels.push(`${formatCompactNumber(runtime.tokenUsage.totalTokens)} used`)
  }

  if (runtime?.tokenUsage?.contextLeft !== undefined) {
    labels.push(`${formatCompactNumber(runtime.tokenUsage.contextLeft)} left`)
  }

  for (const bucket of runtime?.usageBuckets ?? []) {
    labels.push(`${bucket.label} ${bucket.usedPercent}%`)
  }

  return labels
}

interface SessionRuntimeBadgesProps {
  runtime: DiscoveredSessionRuntime | undefined
  className?: string
}

export function SessionRuntimeBadges({ runtime, className }: SessionRuntimeBadgesProps) {
  const labels = getRuntimeLabels(runtime)
  if (labels.length === 0) return null

  return (
    <div className={className ?? "mt-1.5 flex flex-wrap gap-1.5"}>
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  )
}
