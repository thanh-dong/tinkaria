import { useState } from "react"
import {
  BookOpen,
  Edit3,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react"
import type { ProjectRule } from "../../../shared/project-agent-types"
import { formatRelativeTimestamp } from "./coordination-helpers"
import { Button } from "../ui/button"

export interface RulesPanelProps {
  rules: ProjectRule[]
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

  function startEdit(rule: ProjectRule) {
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Rules
          {rules.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({rules.length})
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Add rule"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <textarea
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            placeholder="Rule content..."
            rows={3}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            autoFocus
          />
          <Button variant="default" size="sm" onClick={handleAdd}>
            Add Rule
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {rules.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No rules</p>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors">
            {editingId === rule.id ? (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => handleSaveEdit(rule.id)} aria-label="Save">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(null)} aria-label="Cancel">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground flex-1">{rule.content}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(rule)} aria-label="Edit rule">
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => onRemoveRule(rule.id)} aria-label="Remove rule">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-6">
                  <span className="text-xs text-muted-foreground">by {rule.setBy}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(rule.updatedAt)}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
