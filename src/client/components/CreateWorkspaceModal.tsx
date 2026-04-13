import { useState } from "react"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogTitle,
  DialogFooter,
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
} from "./ui/dialog"
import { Input } from "./ui/input"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
}

export function CreateWorkspaceModal({ open, onOpenChange, onConfirm }: Props) {
  const [name, setName] = useState("")

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    setName("")
    onOpenChange(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setName("")
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" className={RESPONSIVE_MODAL_CONTENT_CLASS_NAME}>
        <DialogBody>
          <DialogTitle>Create Workspace</DialogTitle>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="workspace-name" className="text-sm font-medium text-foreground">
                Workspace name
              </label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My workspace"
                className="mt-1.5"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit()
                }}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter className={RESPONSIVE_MODAL_FOOTER_CLASS_NAME}>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
