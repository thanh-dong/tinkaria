import { useState } from "react"
import { DEFAULT_NEW_PROJECT_ROOT } from "../../shared/branding"
import { getUiIdentityAttributeProps, type UiIdentityDescriptor } from "../lib/uiIdentityOverlay"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import { Input } from "./ui/input"
import { SegmentedControl } from "./ui/segmented-control"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (project: { mode: Tab; localPath: string; title: string }) => void
  rootUiId?: string | UiIdentityDescriptor
}

type Tab = "new" | "existing"

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function NewProjectModal({ open, onOpenChange, onConfirm, rootUiId }: Props) {
  const [openVersion, setOpenVersion] = useState(0)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      setOpenVersion((current) => current + 1)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" {...(rootUiId ? getUiIdentityAttributeProps(rootUiId) : {})}>
        {open ? (
          <NewProjectModalBody
            key={openVersion}
            onClose={() => handleOpenChange(false)}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function NewProjectModalBody({
  onClose,
  onConfirm,
}: {
  onClose: () => void
  onConfirm: (project: { mode: Tab; localPath: string; title: string }) => void
}) {
  const [tab, setTab] = useState<Tab>("new")
  const [name, setName] = useState("")
  const [existingPath, setExistingPath] = useState("")

  const kebab = toKebab(name)
  const newPath = kebab ? `${DEFAULT_NEW_PROJECT_ROOT}/${kebab}` : ""
  const trimmedExisting = existingPath.trim()
  const canSubmit = tab === "new" ? kebab.length > 0 : trimmedExisting.length > 0

  function handleSubmit() {
    if (!canSubmit) return
    if (tab === "new") {
      onConfirm({ mode: "new", localPath: newPath, title: name.trim() })
    } else {
      const folderName = trimmedExisting.split("/").pop() || trimmedExisting
      onConfirm({ mode: "existing", localPath: trimmedExisting, title: folderName })
    }
    onClose()
  }

  return (
    <>
      <DialogBody className="space-y-4">
        <DialogTitle>Add Project</DialogTitle>

        <SegmentedControl
          value={tab}
          onValueChange={setTab}
          options={[
            { value: "new" as Tab, label: "New Folder" },
            { value: "existing" as Tab, label: "Existing Path" },
          ]}
          className="w-full mb-2"
          optionClassName="flex-1 justify-center"
        />

        {tab === "new" ? (
          <div className="space-y-2">
            <Input
              autoFocus
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit()
                if (event.key === "Escape") onClose()
              }}
              placeholder="Project name"
            />
            {newPath ? (
              <p className="text-xs text-muted-foreground font-mono">
                {newPath}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              autoFocus
              type="text"
              value={existingPath}
              onChange={(event) => setExistingPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit()
                if (event.key === "Escape") onClose()
              }}
              placeholder="~/Projects/my-app"
            />
            <p className="text-xs text-muted-foreground">
              The folder will be created if it doesn&apos;t exist.
            </p>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          Create
        </Button>
      </DialogFooter>
    </>
  )
}
