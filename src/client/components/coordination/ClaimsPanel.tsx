import { useMemo, useState } from "react"
import {
  FileCode2,
  AlertTriangle,
  Shield,
  ShieldOff,
} from "lucide-react"
import type { WorkspaceClaim } from "../../../shared/workspace-types"
import { isClaimConflicting, formatRelativeTimestamp } from "./coordination-helpers"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip"
import { PanelHeader, PanelAddForm, PanelBody, PanelEmptyState, PanelListItem, PanelCollapsibleSection, SessionSelect, type SessionOption } from "./CoordinationPanel"

export interface ClaimsPanelProps {
  claims: WorkspaceClaim[]
  sessions?: SessionOption[]
  onCreateClaim: (intent: string, files: string[], sessionId: string) => void
  onReleaseClaim: (claimId: string) => void
}

export function ClaimsPanel({
  claims,
  sessions,
  onCreateClaim,
  onReleaseClaim,
}: ClaimsPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newIntent, setNewIntent] = useState("")
  const [newFiles, setNewFiles] = useState("")
  const [newSessionId, setNewSessionId] = useState("")

  const [activeClaims, releasedClaims] = useMemo(() => claims.reduce<[WorkspaceClaim[], WorkspaceClaim[]]>(
    ([active, released], c) => {
      ;(c.status === "active" ? active : released).push(c)
      return [active, released]
    },
    [[], []]
  ), [claims])

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
      <PanelHeader title="Claims" count={activeClaims.length} countLabel={`${activeClaims.length} active`} onAdd={() => setShowAddForm(!showAddForm)} addLabel="Create claim" />

      <PanelAddForm show={showAddForm}>
        <Input
          size="sm"
          placeholder="Intent (e.g. fix auth bug)..."
          value={newIntent}
          onChange={(e) => setNewIntent(e.target.value)}
          autoFocus
        />
        <Input
          size="sm"
          placeholder="Files (comma-separated)..."
          value={newFiles}
          onChange={(e) => setNewFiles(e.target.value)}
        />
        <SessionSelect sessions={sessions} value={newSessionId} onChange={setNewSessionId} />
        <Button variant="default" size="sm" onClick={handleCreate}>
          Claim
        </Button>
      </PanelAddForm>

      <PanelBody>
        {claims.length === 0 && (
          <PanelEmptyState message="No active claims" description="Claim files to prevent conflicts" actionLabel="Create claim" onAction={() => setShowAddForm(true)} />
        )}
        {activeClaims.map((claim) => {
          const conflicting = isClaimConflicting(claim)
          return (
            <PanelListItem
              key={claim.id}
              className={conflicting ? "bg-red-500/5 border-l-2 border-l-red-500" : undefined}
            >
              <div className="flex items-center gap-2">
                {conflicting ? (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                ) : (
                  <Shield className="h-4 w-4 text-green-500 shrink-0" />
                )}
                <span className="text-sm font-medium text-foreground truncate">{claim.intent}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      onClick={() => onReleaseClaim(claim.id)}
                      aria-label="Release claim"
                    >
                      <ShieldOff className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Release claim</TooltipContent>
                </Tooltip>
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
            </PanelListItem>
          )
        })}
        {releasedClaims.length > 0 && (
          <PanelCollapsibleSection label="Released" count={releasedClaims.length}>
            {releasedClaims.map((claim) => (
              <PanelListItem key={claim.id} className="opacity-50">
                <div className="flex items-center gap-2">
                  <ShieldOff className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">{claim.intent}</span>
                </div>
              </PanelListItem>
            ))}
          </PanelCollapsibleSection>
        )}
      </PanelBody>
    </div>
  )
}
