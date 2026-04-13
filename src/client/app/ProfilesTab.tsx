import { useState } from "react"
import { Plus, Edit3, Trash2, User, Bot } from "lucide-react"
import { cn } from "../lib/utils"
import { useProfileSubscription } from "./useProfileSubscription"
import type { AppState } from "./useAppState"
import type { ProviderProfile, ProviderProfileRecord } from "../../shared/profile-types"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip"
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
} from "../components/ui/alert-dialog"

function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const EMPTY_FORM: ProviderProfile = {
  id: "",
  name: "",
  provider: "claude",
  model: "",
  runtime: "system",
  apiKeyRef: "",
  systemPrompt: "",
}

function ProfileForm({
  initial,
  onSubmit,
  onCancel,
  isEdit,
}: {
  initial: ProviderProfile
  onSubmit: (profile: ProviderProfile) => void
  onCancel: () => void
  isEdit: boolean
}) {
  const [form, setForm] = useState<ProviderProfile>(initial)

  function handleSubmit() {
    if (!form.name.trim() || !form.model.trim()) return
    onSubmit({
      ...form,
      id: isEdit ? form.id : generateProfileId(),
      apiKeyRef: form.apiKeyRef?.trim() || undefined,
      systemPrompt: form.systemPrompt?.trim() || undefined,
    })
  }

  return (
    <div className="space-y-2">
      {isEdit && (
        <div className="text-xs text-muted-foreground font-mono">{form.id}</div>
      )}
      <Input
        size="sm"
        placeholder="Name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          className={cn(
            "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          value={form.provider}
          onChange={(e) => setForm({ ...form, provider: e.target.value as "claude" | "codex" })}
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
        <Input
          size="sm"
          placeholder="Model *"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
      </div>
      <Input
        size="sm"
        placeholder="API key ref (e.g. env:ANTHROPIC_API_KEY)"
        value={form.apiKeyRef ?? ""}
        onChange={(e) => setForm({ ...form, apiKeyRef: e.target.value })}
      />
      <Textarea
        size="sm"
        placeholder="System prompt"
        rows={3}
        value={form.systemPrompt ?? ""}
        onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
      />
      <div className="flex gap-1">
        <Button variant="default" size="sm" onClick={handleSubmit}>
          {isEdit ? "Save" : "Create"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ProfileCard({
  record,
  onEdit,
  onRemove,
}: {
  record: ProviderProfileRecord
  onEdit: () => void
  onRemove: () => void
}) {
  const { profile } = record
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-border hover:bg-accent/30 transition-colors">
      {profile.provider === "claude" ? (
        <Bot className="size-4 mt-0.5 text-muted-foreground shrink-0" />
      ) : (
        <User className="size-4 mt-0.5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground">{profile.name}</span>
          <span className="text-xs text-muted-foreground">{profile.provider}/{profile.model}</span>
          {profile.apiKeyRef && (
            <span className="text-xs font-mono text-muted-foreground/70">{profile.apiKeyRef}</span>
          )}
        </div>
        {profile.systemPrompt && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.systemPrompt}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit profile">
              <Edit3 className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit profile</TooltipContent>
        </Tooltip>
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Remove profile">
                  <Trash2 className="size-3" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Remove profile</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove profile?</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{profile.name}&quot; will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

export function ProfilesTab({ state }: { state: AppState }) {
  const snapshot = useProfileSubscription(state.socket)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleCreate(profile: ProviderProfile) {
    void state.socket.command({ type: "profile.save", profile })
    setShowAddForm(false)
  }

  function handleUpdate(profile: ProviderProfile) {
    void state.socket.command({ type: "profile.save", profile })
    setEditingId(null)
  }

  function handleRemove(profileId: string) {
    void state.socket.command({ type: "profile.remove", profileId })
  }

  const profiles = snapshot?.profiles ?? []

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Profiles</h1>
          <p className="text-sm text-muted-foreground mt-1">Saved provider configurations for quick reuse.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="size-3.5 mr-1.5" />
          New profile
        </Button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <ProfileForm
            initial={EMPTY_FORM}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isEdit={false}
          />
        </div>
      )}

      {profiles.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
          <User className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No profiles yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Create a profile to save provider settings</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="size-3.5 mr-1.5" />
            New profile
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((record) =>
            editingId === record.id ? (
              <div key={record.id} className="rounded-lg border border-border bg-card p-4">
                <ProfileForm
                  initial={record.profile}
                  onSubmit={handleUpdate}
                  onCancel={() => setEditingId(null)}
                  isEdit
                />
              </div>
            ) : (
              <ProfileCard
                key={record.id}
                record={record}
                onEdit={() => setEditingId(record.id)}
                onRemove={() => handleRemove(record.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
