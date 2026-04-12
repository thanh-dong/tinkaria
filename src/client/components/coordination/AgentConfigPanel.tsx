import { useState } from "react"
import {
  Bot,
  Edit3,
  Trash2,
  GitCommit,
} from "lucide-react"
import type { AgentConfig, AgentConfigRecord } from "../../../shared/agent-config-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
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

export interface AgentConfigPanelProps {
  configs: AgentConfigRecord[]
  onSave: (config: AgentConfig) => void
  onRemove: (agentId: string) => void
}

function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const EMPTY_FORM: AgentConfig = {
  id: "",
  name: "",
  description: "",
  provider: "claude",
  model: "",
  systemPrompt: "",
  tools: [],
  temperature: 0.7,
}

function AgentForm({
  initial,
  onSubmit,
  onCancel,
  isEdit,
}: {
  initial: AgentConfig
  onSubmit: (config: AgentConfig) => void
  onCancel: () => void
  isEdit: boolean
}) {
  const [form, setForm] = useState<AgentConfig>(initial)
  const [toolsStr, setToolsStr] = useState((initial.tools ?? []).join(", "))

  function handleSubmit() {
    if (!form.name.trim() || !form.provider.trim() || !form.model.trim()) return
    const tools = toolsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    onSubmit({
      ...form,
      id: isEdit ? form.id : generateAgentId(),
      tools: tools.length > 0 ? tools : undefined,
      temperature: form.temperature ?? undefined,
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
      <Input
        size="sm"
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          size="sm"
          placeholder="Provider *"
          value={form.provider}
          onChange={(e) => setForm({ ...form, provider: e.target.value as "claude" | "codex" })}
        />
        <Input
          size="sm"
          placeholder="Model *"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
      </div>
      <Textarea
        size="sm"
        placeholder="System prompt"
        rows={3}
        value={form.systemPrompt ?? ""}
        onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
      />
      <Input
        size="sm"
        placeholder="Tools (comma-separated)"
        value={toolsStr}
        onChange={(e) => setToolsStr(e.target.value)}
      />
      <Input
        size="sm"
        type="number"
        placeholder="Temperature (0-1)"
        min={0}
        max={1}
        step={0.1}
        value={form.temperature ?? ""}
        onChange={(e) =>
          setForm({
            ...form,
            temperature: e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
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

export function AgentConfigPanel({
  configs,
  onSave,
  onRemove,
}: AgentConfigPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleCreate(config: AgentConfig) {
    onSave(config)
    setShowAddForm(false)
  }

  function handleUpdate(config: AgentConfig) {
    onSave(config)
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        title="Agents"
        count={configs.length}
        onAdd={() => setShowAddForm(!showAddForm)}
        addLabel="Add agent config"
      />

      <PanelAddForm show={showAddForm}>
        <AgentForm
          initial={EMPTY_FORM}
          onSubmit={handleCreate}
          onCancel={() => setShowAddForm(false)}
          isEdit={false}
        />
      </PanelAddForm>

      <PanelBody>
        {configs.length === 0 && (
          <PanelEmptyState
            message="No agent configs"
            description="Define agent configurations for your workspace"
            actionLabel="Add agent"
            onAction={() => setShowAddForm(true)}
          />
        )}
        {configs.map((record) =>
          editingId === record.id ? (
            <PanelListItem key={record.id}>
              <AgentForm
                initial={record.config}
                onSubmit={handleUpdate}
                onCancel={() => setEditingId(null)}
                isEdit
              />
            </PanelListItem>
          ) : (
            <PanelListItem key={record.id}>
              <div className="flex items-start gap-2">
                <Bot className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">
                      {record.config.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {record.config.provider}/{record.config.model}
                    </span>
                  </div>
                  {record.config.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {record.config.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTimestamp(new Date(record.updatedAt).toISOString())}
                    </span>
                    {record.lastCommitHash && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground font-mono">
                        <GitCommit className="h-3 w-3" />
                        {record.lastCommitHash.slice(0, 7)}
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
                        onClick={() => setEditingId(record.id)}
                        aria-label="Edit agent"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit agent</TooltipContent>
                  </Tooltip>
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove agent"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Remove agent</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove agent config?</AlertDialogTitle>
                        <AlertDialogDescription>
                          "{record.config.name}" will be permanently removed from the
                          workspace.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRemove(record.id)}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </PanelListItem>
          )
        )}
      </PanelBody>
    </div>
  )
}
