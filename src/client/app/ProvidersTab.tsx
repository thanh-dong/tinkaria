import { useOutletContext } from "react-router-dom"
import { Activity, RefreshCw, Trash2, Box } from "lucide-react"
import { cn } from "../lib/utils"
import { useRuntimeSubscription } from "./useRuntimeSubscription"
import type { AppState } from "./useAppState"
import type { RuntimeEntry, RuntimeHealthStatus } from "../../shared/runtime-types"
import { Button } from "../components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip"

function HealthDot({ status }: { status: RuntimeHealthStatus["status"] }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full shrink-0", {
        "bg-green-500": status === "healthy",
        "bg-yellow-500": status === "degraded",
        "bg-red-500": status === "unavailable",
      })}
    />
  )
}

function SourceBadge({ source }: { source: RuntimeEntry["source"] }) {
  return (
    <span
      className={cn(
        "text-xs px-1.5 py-0.5 rounded font-medium",
        source === "managed"
          ? "bg-blue-500/15 text-blue-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {source}
    </span>
  )
}

interface RuntimeCardProps {
  runtime: RuntimeEntry & { health: RuntimeHealthStatus }
  onHealthCheck: () => void
  onRemove: () => void
  onDetect: () => void
}

function RuntimeCard({ runtime, onHealthCheck, onRemove, onDetect }: RuntimeCardProps) {
  const { health } = runtime
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="size-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground">{runtime.provider}</span>
              <span className="text-xs text-muted-foreground font-mono">v{runtime.version}</span>
              <SourceBadge source={runtime.source} />
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{runtime.binaryPath}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onDetect}>
                <RefreshCw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scan system</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onHealthCheck}>
                <Activity className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Health check</TooltipContent>
          </Tooltip>
          {runtime.source === "managed" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onRemove}>
                  <Trash2 className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove runtime</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HealthDot status={health.status} />
        <span className="capitalize">{health.status}</span>
        {health.latencyMs > 0 && <span>{health.latencyMs}ms</span>}
        {health.error && (
          <span className="text-red-400 truncate">{health.error}</span>
        )}
      </div>
    </div>
  )
}

export function ProvidersTab() {
  const state = useOutletContext<AppState>()
  const snapshot = useRuntimeSubscription(state.socket)

  function handleDetect(provider: "claude" | "codex") {
    void state.socket.command({ type: "runtime.detect", provider })
  }

  function handleHealthCheck(provider: "claude" | "codex", version: string) {
    void state.socket.command({ type: "runtime.health", provider, version })
  }

  function handleRemove(provider: "claude" | "codex", version: string) {
    void state.socket.command({ type: "runtime.remove", provider, version })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Providers</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage runtime binaries for Claude and Codex.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDetect("claude")}
        >
          <RefreshCw className="size-3.5 mr-1.5" />
          Scan Claude
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDetect("codex")}
        >
          <RefreshCw className="size-3.5 mr-1.5" />
          Scan Codex
        </Button>
      </div>

      {!snapshot || snapshot.runtimes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
          <Box className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No runtimes detected</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Use Scan above to detect installed CLIs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshot.runtimes.map((runtime) => (
            <RuntimeCard
              key={`${runtime.provider}-${runtime.version}`}
              runtime={runtime}
              onDetect={() => handleDetect(runtime.provider)}
              onHealthCheck={() => handleHealthCheck(runtime.provider, runtime.version)}
              onRemove={() => handleRemove(runtime.provider, runtime.version)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
