import { useState } from "react"
import {
  GitBranch,
  GitFork,
  Plus,
  Trash2,
  User,
  UserPlus,
} from "lucide-react"
import type { ProjectWorktree } from "../../../shared/project-agent-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface WorktreesPanelProps {
  worktrees: ProjectWorktree[]
  onCreateWorktree: (branch: string, baseBranch: string) => void
  onAssignWorktree: (worktreeId: string, sessionId: string) => void
  onRemoveWorktree: (worktreeId: string) => void
}

const STATUS_COLOR: Record<string, string> = {
  ready: "text-blue-400",
  assigned: "text-green-500",
  removed: "text-muted-foreground",
}

export function WorktreesPanel({
  worktrees,
  onCreateWorktree,
  onAssignWorktree,
  onRemoveWorktree,
}: WorktreesPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBranch, setNewBranch] = useState("")
  const [newBaseBranch, setNewBaseBranch] = useState("main")
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignSessionId, setAssignSessionId] = useState("")

  const activeWorktrees = worktrees.filter((w) => w.status !== "removed")
  const removedWorktrees = worktrees.filter((w) => w.status === "removed")

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Worktrees
          {activeWorktrees.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({activeWorktrees.length})
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Create worktree"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Branch name (e.g. feat/auth)..."
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <input
              className="flex-1 bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Base branch"
              value={newBaseBranch}
              onChange={(e) => setNewBaseBranch(e.target.value)}
            />
            <Button variant="default" size="sm" onClick={handleCreate}>
              Create
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {worktrees.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No worktrees</p>
        )}
        {activeWorktrees.map((wt) => (
          <div key={wt.id} className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <GitBranch className={cn("h-4 w-4 shrink-0", STATUS_COLOR[wt.status] ?? "text-muted-foreground")} />
              <span className="text-sm font-mono font-medium text-foreground truncate">{wt.branch}</span>
              <GitFork className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-mono">{wt.baseBranch}</span>
              <div className="ml-auto flex items-center gap-1">
                {wt.status === "ready" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAssigningId(assigningId === wt.id ? null : wt.id)}
                    aria-label="Assign session"
                  >
                    <UserPlus className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemoveWorktree(wt.id)}
                  aria-label="Remove worktree"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
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
                <input
                  className="flex-1 bg-transparent border border-border rounded-md px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Session ID..."
                  value={assignSessionId}
                  onChange={(e) => setAssignSessionId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAssign(wt.id) }}
                  autoFocus
                />
                <Button variant="default" size="sm" onClick={() => handleAssign(wt.id)}>
                  Assign
                </Button>
              </div>
            )}
            <div className="mt-0.5 ml-6">
              <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(wt.createdAt)}</span>
            </div>
          </div>
        ))}
        {removedWorktrees.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            Removed ({removedWorktrees.length})
          </div>
        )}
      </div>
    </div>
  )
}
