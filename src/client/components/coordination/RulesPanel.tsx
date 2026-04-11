import { useState } from "react"
import {
  BookOpen,
  Edit3,
  Trash2,
  Check,
  X,
} from "lucide-react"
import type { WorkspaceRule } from "../../../shared/workspace-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "../ui/alert-dialog"
import { PanelHeader, PanelAddForm, PanelBody, PanelEmptyState, PanelListItem } from "./CoordinationPanel"

export interface RulesPanelProps {
  rules: WorkspaceRule[]
  onSetRule: (ruleId: string, content: string, setBy: string) => void
  onRemoveRule: (ruleId: string) => void
}

export function RulesPanel({
  rules,
  onSetRule,
  onRemoveRule,
}: RulesPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newContent, setNewContent] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")

  function handleAdd() {
    const content = newContent.trim()
    if (!content) return
    const ruleId = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    onSetRule(ruleId, content, "ui")
    setNewContent("")
    setShowAddForm(false)
  }

  function startEdit(rule: WorkspaceRule) {
    setEditingId(rule.id)
    setEditContent(rule.content)
  }

  function handleSaveEdit(ruleId: string) {
    const content = editContent.trim()
    if (!content) return
    onSetRule(ruleId, content, "ui")
    setEditingId(null)
    setEditContent("")
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Rules" count={rules.length} onAdd={() => setShowAddForm(!showAddForm)} addLabel="Add rule" />

      <PanelAddForm show={showAddForm}>
        <Textarea
          size="sm"
          placeholder="Rule content..."
          rows={3}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          autoFocus
        />
        <Button variant="default" size="sm" onClick={handleAdd}>
          Add Rule
        </Button>
      </PanelAddForm>

      <PanelBody>
        {rules.length === 0 && (
          <PanelEmptyState message="No rules yet" description="Set conventions for your team" actionLabel="Add rule" onAction={() => setShowAddForm(true)} />
        )}
        {rules.map((rule) => (
          <PanelListItem key={rule.id}>
            {editingId === rule.id ? (
              <div className="space-y-2">
                <Textarea
                  size="sm"
                  rows={3}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setEditingId(null); setEditContent("") } }}
                  autoFocus
                />
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleSaveEdit(rule.id)} aria-label="Save">
                        <Check className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground flex-1">{rule.content}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={() => startEdit(rule)} aria-label="Edit rule">
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit rule</TooltipContent>
                    </Tooltip>
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Remove rule">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Remove rule</TooltipContent>
                      </Tooltip>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove rule?</AlertDialogTitle>
                          <AlertDialogDescription>This rule will be permanently removed from the workspace.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onRemoveRule(rule.id)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-6">
                  <span className="text-xs text-muted-foreground">by {rule.setBy}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(rule.updatedAt)}</span>
                </div>
              </>
            )}
          </PanelListItem>
        ))}
      </PanelBody>
    </div>
  )
}
