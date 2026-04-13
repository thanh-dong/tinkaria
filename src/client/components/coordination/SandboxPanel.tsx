import type { SandboxSnapshot } from "../../../shared/sandbox-types"
import type { ClientCommand } from "../../../shared/protocol"
import { Button } from "../ui/button"
import { PanelBody, PanelEmptyState } from "./CoordinationPanel"

interface SandboxPanelProps {
  snapshot: SandboxSnapshot | null
  onCommand: (command: ClientCommand) => void
  workspaceId: string
}

const statusColors: Record<string, string> = {
  creating: "text-yellow-500",
  running: "text-green-500",
  stopped: "text-gray-500",
  error: "text-red-500",
}

export function SandboxPanel({ snapshot, onCommand, workspaceId }: SandboxPanelProps) {
  const sandbox = snapshot?.sandbox

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Sandbox
          {sandbox && (
            <span className={`ml-1.5 text-xs font-normal ${statusColors[sandbox.status] ?? "text-muted-foreground"}`}>
              {sandbox.status}
            </span>
          )}
        </h3>
        <div className="flex gap-1">
          {!sandbox && (
            <Button variant="default" size="sm" onClick={() => onCommand({ type: "workspace.sandbox.create", workspaceId })}>
              Create
            </Button>
          )}
          {sandbox?.status === "stopped" && (
            <Button variant="ghost" size="sm" onClick={() => onCommand({ type: "workspace.sandbox.start", workspaceId })}>
              Start
            </Button>
          )}
          {sandbox?.status === "running" && (
            <Button variant="ghost" size="sm" onClick={() => onCommand({ type: "workspace.sandbox.stop", workspaceId })}>
              Stop
            </Button>
          )}
          {sandbox && (
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => onCommand({ type: "workspace.sandbox.destroy", workspaceId })}>
              Destroy
            </Button>
          )}
        </div>
      </div>
      <PanelBody>
        {!sandbox ? (
          <PanelEmptyState
            message="No sandbox configured"
            description="Create a sandbox environment for this workspace"
            actionLabel="Create sandbox"
            onAction={() => onCommand({ type: "workspace.sandbox.create", workspaceId })}
          />
        ) : (
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
        )}
      </PanelBody>
    </div>
  )
}
