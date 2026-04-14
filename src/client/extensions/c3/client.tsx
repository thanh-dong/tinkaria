import { useCallback, useEffect, useState } from "react"
import { Building2, ChevronDown, ChevronRight, Loader2, RefreshCw, AlertCircle, FileText, GitBranch } from "lucide-react"
import type { ExtensionProps } from "../../../shared/extension-types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface C3Entity {
  id: string
  name: string
  type: string
  children?: C3Entity[]
  [key: string]: unknown
}

interface C3ListResponse {
  data: C3Entity[] | { items: C3Entity[] } | string
}

interface C3DetailResponse {
  data: string | Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchExtApi<T>(route: string, localPath: string, params?: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ projectPath: localPath, ...params })
  const res = await fetch(`/api/ext/c3/${route}?${qs.toString()}`)
  if (!res.ok) throw new Error(`Extension API error: ${res.status}`)
  return res.json()
}

/** Normalize whatever the server sends into a flat/nested C3Entity[] */
function normalizeEntities(raw: C3ListResponse["data"]): C3Entity[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return normalizeEntities(parsed)
    } catch (_e: unknown) {
      return []
    }
  }
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object" && "items" in raw && Array.isArray(raw.items)) return raw.items
  // Last resort: wrap the object itself
  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw)
    return entries.map(([key, value]) => ({
      id: key,
      name: key,
      type: "unknown",
      ...(typeof value === "object" && value !== null && !Array.isArray(value) ? value as unknown as Record<string, unknown> : {}),
    }))
  }
  return []
}

/** Flatten a nested tree into a list with depth info for counting */
function countEntities(entities: C3Entity[]): number {
  let count = 0
  for (const e of entities) {
    count++
    if (e.children) count += countEntities(e.children)
  }
  return count
}

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  container: { bg: "bg-blue-500/20", text: "text-blue-400" },
  component: { bg: "bg-green-500/20", text: "text-green-400" },
  workspace: { bg: "bg-purple-500/20", text: "text-purple-400" },
  system: { bg: "bg-amber-500/20", text: "text-amber-400" },
}

function typeBadge(type: string) {
  const style = TYPE_STYLES[type] ?? { bg: "bg-muted", text: "text-muted-foreground" }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailPanel({
  detail,
  graph,
  detailLoading,
  graphLoading,
}: {
  detail: string | Record<string, unknown> | null
  graph: string | null
  detailLoading: boolean
  graphLoading: boolean
}) {
  if (detailLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-muted-foreground text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        Loading details...
      </div>
    )
  }

  if (!detail && !graph) return null

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
      {detail !== null && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <FileText className="size-3" />
            Details
          </div>
          {typeof detail === "string" ? (
            <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-80 overflow-y-auto">
              {detail}
            </pre>
          ) : (
            <pre className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-80 overflow-y-auto">
              {JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </div>
      )}
      {(graphLoading || graph) && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <GitBranch className="size-3" />
            Dependency Graph
          </div>
          {graphLoading ? (
            <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Loading graph...
            </div>
          ) : graph ? (
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-60 overflow-y-auto bg-card rounded p-3 border border-border">
              {graph}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  )
}

function EntityCard({
  entity,
  depth,
  selectedId,
  onSelect,
  detail,
  graph,
  detailLoading,
  graphLoading,
}: {
  entity: C3Entity
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  detail: string | Record<string, unknown> | null
  graph: string | null
  detailLoading: boolean
  graphLoading: boolean
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const isSelected = selectedId === entity.id
  const hasChildren = entity.children && entity.children.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(entity.id)}
        className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors hover:bg-accent/50 ${
          isSelected ? "bg-accent/70" : ""
        }`}
        style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <span className="text-xs font-mono text-muted-foreground shrink-0 w-16 truncate">{entity.id}</span>
        <span className="text-sm font-medium text-foreground truncate flex-1">{entity.name}</span>
        {typeBadge(entity.type)}
      </button>

      {isSelected && (
        <DetailPanel
          detail={detail}
          graph={graph}
          detailLoading={detailLoading}
          graphLoading={graphLoading}
        />
      )}

      {hasChildren && expanded && (
        <div>
          {entity.children!.map((child) => (
            <EntityCard
              key={child.id}
              entity={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              detail={selectedId === child.id ? detail : null}
              graph={selectedId === child.id ? graph : null}
              detailLoading={selectedId === child.id ? detailLoading : false}
              graphLoading={selectedId === child.id ? graphLoading : false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function C3Extension({ localPath }: ExtensionProps) {
  const [entities, setEntities] = useState<C3Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [graph, setGraph] = useState<string | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedId(null)
    setDetail(null)
    setGraph(null)
    try {
      const res = await fetchExtApi<C3ListResponse>("list", localPath)
      setEntities(normalizeEntities(res.data))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setEntities([])
    } finally {
      setLoading(false)
    }
  }, [localPath])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleSelect = useCallback(
    async (id: string) => {
      if (selectedId === id) {
        setSelectedId(null)
        setDetail(null)
        setGraph(null)
        return
      }

      setSelectedId(id)
      setDetail(null)
      setGraph(null)

      // Fetch detail and graph in parallel
      setDetailLoading(true)
      setGraphLoading(true)

      fetchExtApi<C3DetailResponse>("read", localPath, { id })
        .then((res) => setDetail(res.data))
        .catch(() => setDetail(null))
        .finally(() => setDetailLoading(false))

      fetchExtApi<C3DetailResponse>("graph", localPath, { id })
        .then((res) => setGraph(typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2)))
        .catch(() => setGraph(null))
        .finally(() => setGraphLoading(false))
    },
    [selectedId, localPath],
  )

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading architecture...</p>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <AlertCircle className="size-5 text-destructive" />
          <p className="text-sm text-foreground">{error}</p>
          <button
            type="button"
            onClick={fetchList}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  if (entities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <Building2 className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No architecture components found</p>
          <button
            type="button"
            onClick={fetchList}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Main view
  // -------------------------------------------------------------------------
  const total = countEntities(entities)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Description bar — no heading (tab label already shows "Architecture") */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-sm text-muted-foreground">
          {total} {total === 1 ? "entity" : "entities"} across containers and components
        </span>
        <button
          type="button"
          onClick={fetchList}
          className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            depth={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            detail={selectedId === entity.id ? detail : null}
            graph={selectedId === entity.id ? graph : null}
            detailLoading={selectedId === entity.id ? detailLoading : false}
            graphLoading={selectedId === entity.id ? graphLoading : false}
          />
        ))}
      </div>
    </div>
  )
}
