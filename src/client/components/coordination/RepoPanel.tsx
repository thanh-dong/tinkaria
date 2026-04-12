import { useState } from "react"
import {
  FolderGit2,
  GitBranch,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
} from "lucide-react"
import type { RepoSummary } from "../../../shared/types"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "../ui/alert-dialog"
import {
  PanelHeader,
  PanelAddForm,
  PanelBody,
  PanelEmptyState,
  PanelListItem,
} from "./CoordinationPanel"

export interface RepoPanelProps {
  repos: RepoSummary[]
  onAddRepo: (localPath: string, label?: string) => void
  onCloneRepo: (origin: string, targetPath: string, label?: string) => void
  onRemoveRepo: (repoId: string) => void
  onPullRepo: (repoId: string) => void
  onPushRepo: (repoId: string) => void
}

type AddMode = "local" | "clone" | null

function StatusBadge({ status }: { status: RepoSummary["status"] }) {
  const styles: Record<RepoSummary["status"], string> = {
    cloned: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    pending: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    error: "bg-red-500/15 text-red-600 dark:text-red-400",
  }
  const labels: Record<RepoSummary["status"], string> = {
    cloned: "cloned",
    pending: "cloning...",
    error: "error",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path
}

function truncateOrigin(origin: string, maxLen = 40): string {
  if (origin.length <= maxLen) return origin
  return `...${origin.slice(-(maxLen - 3))}`
}

function AddLocalForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (localPath: string, label?: string) => void
  onCancel: () => void
}) {
  const [localPath, setLocalPath] = useState("")
  const [label, setLabel] = useState("")

  function handleSubmit() {
    if (!localPath.trim()) return
    onSubmit(localPath.trim(), label.trim() || undefined)
    setLocalPath("")
    setLabel("")
  }

  return (
    <div className="space-y-2">
      <Input
        size="sm"
        placeholder="Local path *"
        value={localPath}
        onChange={(e) => setLocalPath(e.target.value)}
        autoFocus
      />
      <Input
        size="sm"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="flex gap-1">
        <Button variant="default" size="sm" onClick={handleSubmit}>
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function CloneForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (origin: string, targetPath: string, label?: string) => void
  onCancel: () => void
}) {
  const [origin, setOrigin] = useState("")
  const [targetPath, setTargetPath] = useState("")
  const [label, setLabel] = useState("")

  function handleSubmit() {
    if (!origin.trim() || !targetPath.trim()) return
    onSubmit(origin.trim(), targetPath.trim(), label.trim() || undefined)
    setOrigin("")
    setTargetPath("")
    setLabel("")
  }

  return (
    <div className="space-y-2">
      <Input
        size="sm"
        placeholder="Origin URL *"
        value={origin}
        onChange={(e) => setOrigin(e.target.value)}
        autoFocus
      />
      <Input
        size="sm"
        placeholder="Target path *"
        value={targetPath}
        onChange={(e) => setTargetPath(e.target.value)}
      />
      <Input
        size="sm"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="flex gap-1">
        <Button variant="default" size="sm" onClick={handleSubmit}>
          Clone
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function RepoPanel({
  repos,
  onAddRepo,
  onCloneRepo,
  onRemoveRepo,
  onPullRepo,
  onPushRepo,
}: RepoPanelProps) {
  const [addMode, setAddMode] = useState<AddMode>(null)

  function toggleAddMode() {
    setAddMode((prev) => (prev === null ? "local" : null))
  }

  function handleAdd(localPath: string, label?: string) {
    onAddRepo(localPath, label)
    setAddMode(null)
  }

  function handleClone(origin: string, targetPath: string, label?: string) {
    onCloneRepo(origin, targetPath, label)
    setAddMode(null)
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Repos"
        count={repos.length}
        onAdd={toggleAddMode}
        addLabel="Add repository"
      />

      <PanelAddForm show={addMode !== null}>
        <div className="flex gap-1 mb-2">
          <Button
            variant={addMode === "local" ? "default" : "outline"}
            size="sm"
            onClick={() => setAddMode("local")}
          >
            Add Local
          </Button>
          <Button
            variant={addMode === "clone" ? "default" : "outline"}
            size="sm"
            onClick={() => setAddMode("clone")}
          >
            Clone
          </Button>
        </div>
        {addMode === "local" && (
          <AddLocalForm onSubmit={handleAdd} onCancel={() => setAddMode(null)} />
        )}
        {addMode === "clone" && (
          <CloneForm onSubmit={handleClone} onCancel={() => setAddMode(null)} />
        )}
      </PanelAddForm>

      <PanelBody>
        {repos.length === 0 && (
          <PanelEmptyState
            message="No repositories"
            description="Add local repos or clone from a remote origin"
            actionLabel="Add repo"
            onAction={() => setAddMode("local")}
          />
        )}
        {repos.map((repo) => (
          <PanelListItem key={repo.id}>
            <div className="flex items-start gap-2">
              <FolderGit2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {repo.label ?? basename(repo.localPath)}
                  </span>
                  <StatusBadge status={repo.status} />
                </div>
                {repo.origin && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate" title={repo.origin}>
                    {truncateOrigin(repo.origin)}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono truncate" title={repo.localPath}>
                    {basename(repo.localPath)}
                  </span>
                  {repo.branch && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground font-mono">
                      <GitBranch className="h-3 w-3" />
                      {repo.branch}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onPullRepo(repo.id)}
                      aria-label="Pull"
                    >
                      <ArrowDownToLine className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pull</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onPushRepo(repo.id)}
                      aria-label="Push"
                    >
                      <ArrowUpFromLine className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Push</TooltipContent>
                </Tooltip>
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove repo"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Remove repo</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove repository?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{repo.label ?? basename(repo.localPath)}" will be removed from the workspace. The files on disk will not be deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onRemoveRepo(repo.id)}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </PanelListItem>
        ))}
      </PanelBody>
    </div>
  )
}
