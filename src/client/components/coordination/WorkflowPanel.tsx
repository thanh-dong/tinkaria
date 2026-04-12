import { XCircle, CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react"
import type { WorkflowRunState, WorkflowRunStepResult } from "../../../shared/workflow-types"
import { Button } from "../ui/button"
import {
  PanelBody,
  PanelEmptyState,
  PanelListItem,
} from "./CoordinationPanel"

export interface WorkflowPanelProps {
  runs: WorkflowRunState[]
  activeRunIds: string[]
  onCancelRun: (runId: string) => void
}

function RunStatusBadge({ status }: { status: WorkflowRunState["status"] }) {
  const styles: Record<WorkflowRunState["status"], string> = {
    running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    failed: "bg-red-500/15 text-red-600 dark:text-red-400",
    cancelled: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function StepStatusIcon({ status }: { status: WorkflowRunStepResult["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />
    case "failed":
      return <AlertCircle className="h-3 w-3 text-red-500" />
    case "running":
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
    case "skipped":
      return <Clock className="h-3 w-3 text-muted-foreground" />
    case "pending":
    default:
      return <Clock className="h-3 w-3 text-muted-foreground opacity-50" />
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function RunItem({
  run,
  isActive,
  onCancel,
}: {
  run: WorkflowRunState
  isActive: boolean
  onCancel: () => void
}) {
  return (
    <PanelListItem>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{run.workflowId}</span>
          <RunStatusBadge status={run.status} />
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 ml-auto"
              onClick={onCancel}
            >
              <XCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {formatTime(run.startedAt)} &middot; {run.triggeredBy}
          {run.error && <span className="text-red-500 ml-1">— {run.error}</span>}
        </div>
        {run.steps.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {run.steps.map((step) => (
              <div key={`${step.stepIndex}-${step.repoId ?? ""}`} className="flex items-center gap-1.5 text-[10px]">
                <StepStatusIcon status={step.status} />
                <span className="truncate text-muted-foreground">
                  {step.label ?? step.mcp_tool}
                  {step.repoId && <span className="opacity-60"> ({step.repoId.slice(0, 8)})</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelListItem>
  )
}

export function WorkflowPanel({ runs, activeRunIds, onCancelRun }: WorkflowPanelProps) {
  const activeSet = new Set(activeRunIds)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Workflows
          {runs.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({runs.length})
            </span>
          )}
        </h3>
      </div>
      <PanelBody>
        {runs.length === 0 ? (
          <PanelEmptyState message="No workflow runs yet" />
        ) : (
          runs.map((run) => (
            <RunItem
              key={run.runId}
              run={run}
              isActive={activeSet.has(run.runId)}
              onCancel={() => onCancelRun(run.runId)}
            />
          ))
        )}
      </PanelBody>
    </div>
  )
}
