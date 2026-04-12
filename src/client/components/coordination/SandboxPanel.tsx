import type { SandboxSnapshot } from "../../../shared/sandbox-types"
import type { ClientCommand } from "../../../shared/protocol"
import { Button } from "../ui/button"

interface SandboxPanelProps {
  snapshot: SandboxSnapshot | null
  onCommand: (command: ClientCommand) => void
  workspaceId: string
}

export function SandboxPanel({ snapshot, onCommand, workspaceId }: SandboxPanelProps) {
  const sandbox = snapshot?.sandbox

  if (!sandbox) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h3 className="text-sm font-medium">Sandbox</h3>
          <Button variant="default" size="sm" onClick={() => onCommand({ type: "workspace.sandbox.create", workspaceId })}>
            Create
          </Button>
        </div>
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
          No sandbox configured for this workspace
        </div>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    creating: "text-yellow-500",
    running: "text-green-500",
    stopped: "text-gray-500",
    error: "text-red-500",
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Sandbox</h3>
          <span className={`text-xs font-medium ${statusColors[sandbox.status] ?? "text-muted-foreground"}`}>
            {sandbox.status}
          </span>
        </div>
        <div className="flex gap-1">
          {sandbox.status === "stopped" && (
            <Button variant="ghost" size="sm" onClick={() => onCommand({ type: "workspace.sandbox.start", workspaceId })}>
              Start
            </Button>
          )}
          {sandbox.status === "running" && (
            <Button variant="ghost" size="sm" onClick={() => onCommand({ type: "workspace.sandbox.stop", workspaceId })}>
              Stop
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => onCommand({ type: "workspace.sandbox.destroy", workspaceId })}>
            Destroy
          </Button>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1 text-xs">
        {sandbox.containerId && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Container</span>
            <span className="font-mono">{sandbox.containerId.slice(0, 12)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Memory</span>
          <span>{sandbox.resourceLimits.memoryMb}MB</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">CPU Shares</span>
          <span>{sandbox.resourceLimits.cpuShares}</span>
        </div>
      </div>
    </div>
  )
}
