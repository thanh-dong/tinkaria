import { useMemo, useState } from "react"
import {
  GitBranch,
  GitFork,
  Trash2,
  User,
  UserPlus,
} from "lucide-react"
import type { WorkspaceWorktree, WorktreeStatus } from "../../../shared/workspace-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "../ui/alert-dialog"
import {
  PanelHeader,
  PanelAddForm,
  PanelBody,
  PanelEmptyState,
  PanelListItem,
  PanelCollapsibleSection,
  SessionSelect,
  type SessionOption,
} from "./CoordinationPanel"

export interface WorktreesPanelProps {
  worktrees: WorkspaceWorktree[]
  sessions?: SessionOption[]
  onCreateWorktree: (branch: string, baseBranch: string) => void
  onAssignWorktree: (worktreeId: string, sessionId: string) => void
  onRemoveWorktree: (worktreeId: string) => void
}

const STATUS_COLOR: Record<WorktreeStatus, string> = {
  ready: "text-blue-400",
  assigned: "text-green-500",
  removed: "text-muted-foreground",
}

export function WorktreesPanel({
  worktrees,
  sessions,
  onCreateWorktree,
  onAssignWorktree,
  onRemoveWorktree,
}: WorktreesPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBranch, setNewBranch] = useState("")
  const [newBaseBranch, setNewBaseBranch] = useState("main")
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignSessionId, setAssignSessionId] = useState("")

  const [activeWorktrees, removedWorktrees] = useMemo(() => worktrees.reduce<[WorkspaceWorktree[], WorkspaceWorktree[]]>(
    ([active, removed], w) => {
      ;(w.status !== "removed" ? active : removed).push(w)
      return [active, removed]
    },
    [[], []]
  ), [worktrees])

  function handleCreate() {
    const branch = newBranch.trim()
    const baseBranch = newBaseBranch.trim()
    if (!branch) return
    onCreateWorktree(branch, baseBranch || "main")
    setNewBranch("")
    setNewBaseBranch("main")
    setShowAddForm(false)
  }

  function handleAssign(worktreeId: string) {
    const sessionId = assignSessionId.trim()
    if (!sessionId) return
    onAssignWorktree(worktreeId, sessionId)
    setAssigningId(null)
    setAssignSessionId("")
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Worktrees" count={activeWorktrees.length} onAdd={() => setShowAddForm(!showAddForm)} addLabel="Create worktree" />

      <PanelAddForm show={showAddForm}>
        <Input
          size="sm"
          placeholder="Branch name (e.g. feat/auth)..."
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            className="flex-1"
            placeholder="Base branch"
            value={newBaseBranch}
            onChange={(e) => setNewBaseBranch(e.target.value)}
          />
          <Button variant="default" size="sm" onClick={handleCreate}>
            Create
          </Button>
        </div>
      </PanelAddForm>

      <PanelBody>
        {worktrees.length === 0 && (
          <PanelEmptyState message="No worktrees" description="Create isolated branches for parallel work" actionLabel="Add worktree" onAction={() => setShowAddForm(true)} />
        )}
        {activeWorktrees.map((wt) => (
          <PanelListItem key={wt.id}>
            <div className="flex items-center gap-2">
              <GitBranch className={cn("h-4 w-4 shrink-0", STATUS_COLOR[wt.status] ?? "text-muted-foreground")} />
              <span className="text-sm font-mono font-medium text-foreground truncate">{wt.branch}</span>
              <GitFork className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-mono">{wt.baseBranch}</span>
              <span className={cn("text-xs px-1 rounded", STATUS_COLOR[wt.status] ?? "text-muted-foreground")}>{wt.status}</span>
              <div className="ml-auto flex items-center gap-1">
                {wt.status === "ready" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setAssigningId(assigningId === wt.id ? null : wt.id)}
                        aria-label="Assign session"
                      >
                        <UserPlus className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Assign session</TooltipContent>
                  </Tooltip>
                )}
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Remove worktree">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Remove worktree</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove worktree?</AlertDialogTitle>
                      <AlertDialogDescription>This will remove the worktree for branch "{wt.branch}". This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onRemoveWorktree(wt.id)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {wt.assignedTo && (
              <div className="flex items-center gap-1 mt-1 ml-6">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{wt.assignedTo}</span>
              </div>
            )}
            {assigningId === wt.id && (
              <div className="flex items-center gap-2 mt-1 ml-6">
                <SessionSelect sessions={sessions} value={assignSessionId} onChange={setAssignSessionId} className="flex-1" autoFocus />
                <Button variant="default" size="sm" onClick={() => handleAssign(wt.id)}>
                  Assign
                </Button>
              </div>
            )}
            <div className="mt-0.5 ml-6">
              <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(wt.createdAt)}</span>
            </div>
          </PanelListItem>
        ))}
        {removedWorktrees.length > 0 && (
          <PanelCollapsibleSection label="Removed" count={removedWorktrees.length}>
            {removedWorktrees.map((wt) => (
              <PanelListItem key={wt.id} className="opacity-50">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground font-mono truncate">{wt.branch}</span>
                </div>
              </PanelListItem>
            ))}
          </PanelCollapsibleSection>
        )}
      </PanelBody>
    </div>
  )
}
