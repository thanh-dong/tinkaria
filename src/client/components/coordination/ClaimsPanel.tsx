import { useState } from "react"
import {
  FileCode2,
  AlertTriangle,
  Shield,
  ShieldOff,
  Plus,
} from "lucide-react"
import type { WorkspaceClaim } from "../../../shared/workspace-types"
import { isClaimConflicting, formatRelativeTimestamp } from "./coordination-helpers"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export interface ClaimsPanelProps {
  claims: WorkspaceClaim[]
  onCreateClaim: (intent: string, files: string[], sessionId: string) => void
  onReleaseClaim: (claimId: string) => void
}

export function ClaimsPanel({
  claims,
  onCreateClaim,
  onReleaseClaim,
}: ClaimsPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newIntent, setNewIntent] = useState("")
  const [newFiles, setNewFiles] = useState("")
  const [newSessionId, setNewSessionId] = useState("")

  const activeClaims = claims.filter((c) => c.status === "active")
  const releasedClaims = claims.filter((c) => c.status !== "active")

  function handleCreate() {
    const intent = newIntent.trim()
    const files = newFiles.split(",").map((f) => f.trim()).filter(Boolean)
    const sessionId = newSessionId.trim()
    if (!intent || files.length === 0 || !sessionId) return
    onCreateClaim(intent, files, sessionId)
    setNewIntent("")
    setNewFiles("")
    setNewSessionId("")
    setShowAddForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Claims
          {activeClaims.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({activeClaims.length} active)
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          aria-label="Create claim"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showAddForm && (
        <div className="px-3 py-2 border-b border-border space-y-2">
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Intent (e.g. fix auth bug)..."
            value={newIntent}
            onChange={(e) => setNewIntent(e.target.value)}
            autoFocus
          />
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Files (comma-separated)..."
            value={newFiles}
            onChange={(e) => setNewFiles(e.target.value)}
          />
          <input
            className="w-full bg-transparent border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Session ID..."
            value={newSessionId}
            onChange={(e) => setNewSessionId(e.target.value)}
          />
          <Button variant="default" size="sm" onClick={handleCreate}>
            Claim
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {claims.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No claims</p>
        )}
        {activeClaims.map((claim) => {
          const conflicting = isClaimConflicting(claim)
          return (
            <div
              key={claim.id}
              className={cn(
                "px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors",
                conflicting && "bg-red-500/5 border-l-2 border-l-red-500"
              )}
            >
              <div className="flex items-center gap-2">
                {conflicting ? (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <Shield className="h-4 w-4 text-green-500 shrink-0" />
                )}
                <span className="text-sm font-medium text-foreground truncate">{claim.intent}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  onClick={() => onReleaseClaim(claim.id)}
                  aria-label="Release claim"
                >
                  <ShieldOff className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1 ml-6">
                {claim.files.map((file) => (
                  <span
                    key={file}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs text-muted-foreground"
                  >
                    <FileCode2 className="h-3 w-3" />
                    {file}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1 ml-6">
                <span className="text-xs text-muted-foreground truncate">{claim.sessionId}</span>
                <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(claim.createdAt)}</span>
                {conflicting && (
                  <span className="text-xs text-red-500 font-medium">
                    conflicts with {claim.conflictsWith}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {releasedClaims.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            Released ({releasedClaims.length})
          </div>
        )}
        {releasedClaims.map((claim) => (
          <div key={claim.id} className="px-3 py-2 border-b border-border/50 opacity-50">
            <div className="flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{claim.intent}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
