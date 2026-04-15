import { useCallback, useEffect, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Building2, ChevronDown, ChevronRight, Loader2, RefreshCw, AlertCircle, FileText, GitBranch } from "lucide-react"
import { Button } from "../../components/ui/button"
import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
} from "../../lib/uiIdentityOverlay"
import { createMarkdownComponents } from "../../components/messages/shared"
import type { ExtensionProps } from "../../../shared/extension-types"

const C3_EXTENSION_UI_DESCRIPTORS = {
  root: createC3UiIdentityDescriptor({
    id: "project.extensions.c3.area",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
  entityItem: createC3UiIdentityDescriptor({
    id: "project.extensions.c3.entity.item",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
  entitySelectAction: createC3UiIdentityDescriptor({
    id: "project.extensions.c3.entity-select.action",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
  entityExpandAction: createC3UiIdentityDescriptor({
    id: "project.extensions.c3.entity-expand.action",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
  detailPanel: createC3UiIdentityDescriptor({
    id: "project.extensions.c3.detail.area",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
  refreshAction: createC3UiIdentityDescriptor({
    id: "project.extensions.c3.refresh.action",
    c3ComponentId: "c3-120",
    c3ComponentLabel: "extensions",
  }),
} as const

export function getC3ExtensionUiIdentityDescriptors() {
  return C3_EXTENSION_UI_DESCRIPTORS
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface C3Entity {
  id: string
  name: string
  title?: string
  type: string
  children?: C3Entity[]
  [key: string]: unknown
}

interface RawC3Entity {
  id: string
  name?: string
  title?: string
  type?: string
  children?: RawC3Entity[]
  [key: string]: unknown
}

interface C3ListResponse {
  data: RawC3Entity[] | { entities?: RawC3Entity[]; items?: RawC3Entity[] } | string
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRawC3EntityArray(value: unknown): value is RawC3Entity[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === "string")
}

function normalizeEntity(entity: RawC3Entity): C3Entity {
  const { children: rawChildren, ...rest } = entity
  const children = isRawC3EntityArray(rawChildren) ? rawChildren.map(normalizeEntity) : undefined
  return {
    ...rest,
    name: entity.name ?? entity.title ?? entity.id,
    type: entity.type ?? "unknown",
    ...(children ? { children } : {}),
  }
}

export function normalizeC3Entities(raw: C3ListResponse["data"]): C3Entity[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return normalizeC3Entities(parsed)
    } catch (_e: unknown) {
      return []
    }
  }
  if (isRawC3EntityArray(raw)) return raw.map(normalizeEntity)
  if (isRecord(raw)) {
    if (isRawC3EntityArray(raw.entities)) return raw.entities.map(normalizeEntity)
    if (isRawC3EntityArray(raw.items)) return raw.items.map(normalizeEntity)
  }
  return []
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []
}

function markdownTableValue(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br />")
}

function normalizeDetailRecord(record: Record<string, unknown>): string {
  const title = stringValue(record.title) ?? stringValue(record.id) ?? "C3 document"
  const metaRows = [
    ["ID", stringValue(record.id)],
    ["Type", stringValue(record.type)],
    ["Status", stringValue(record.status)],
    ["Parent", stringValue(record.parent)],
    ["Category", stringValue(record.category)],
  ].filter((row): row is [string, string] => row[1] !== null)
  const uses = stringArrayValue(record.uses)
  const goal = stringValue(record.goal)
  const body = stringValue(record.body)
  const sections = [`# ${title}`]

  if (metaRows.length > 0) {
    sections.push([
      "| Field | Value |",
      "| --- | --- |",
      ...metaRows.map(([field, value]) => `| ${field} | ${markdownTableValue(value)} |`),
    ].join("\n"))
  }

  if (goal) sections.push(`> ${goal}`)
  if (uses.length > 0) sections.push(["## Uses", ...uses.map((use) => `- \`${use}\``)].join("\n"))
  if (body) sections.push(body)

  return sections.join("\n\n")
}

export function normalizeC3DetailDocument(detail: C3DetailResponse["data"]): string {
  if (typeof detail === "string") {
    try {
      const parsed = JSON.parse(detail) as unknown
      if (isRecord(parsed)) return normalizeDetailRecord(parsed)
    } catch (_error: unknown) {
      return detail
    }
    return detail
  }
  return normalizeDetailRecord(detail)
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

export function C3TreeIndicator({ depth }: { depth: number }) {
  if (depth <= 0) {
    return <span aria-hidden="true" className="w-0 shrink-0" />
  }

  return (
    <span
      aria-label={`Tree depth ${depth}`}
      className="flex h-7 shrink-0"
      style={{ width: `${depth * 1.25}rem` }}
    >
      {Array.from({ length: depth }, (_item, index) => {
        const isBranch = index === depth - 1
        return (
          <span
            key={index}
            aria-hidden="true"
            className={
              isBranch
                ? "relative h-full w-5 shrink-0 before:absolute before:left-2 before:top-0 before:h-1/2 before:border-l before:border-border after:absolute after:left-2 after:top-1/2 after:w-3 after:border-t after:border-border"
                : "relative h-full w-5 shrink-0 before:absolute before:inset-y-0 before:left-2 before:border-l before:border-border/70"
            }
          />
        )
      })}
    </span>
  )
}

export function C3MarkdownDocument({ source }: { source: string }) {
  return (
    <div className="prose prose-sm max-w-none text-foreground prose-headings:scroll-mt-4 prose-headings:font-semibold prose-p:leading-7 prose-pre:max-h-96 prose-pre:overflow-auto prose-table:text-sm dark:prose-invert">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={createMarkdownComponents({ renderRichContentBlocks: false })}
      >
        {source}
      </Markdown>
    </div>
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
    <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3" {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.detailPanel)}>
      {detail !== null && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <FileText className="size-3" />
            Details
          </div>
          <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border bg-background px-4 py-3">
            <C3MarkdownDocument source={normalizeC3DetailDocument(detail)} />
          </div>
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
      <div
        className={`w-full px-4 py-2.5 flex items-center gap-2 transition-colors hover:bg-accent/50 ${
          isSelected ? "bg-accent/70" : ""
        }`}
        {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.entityItem)}
      >
        <C3TreeIndicator depth={depth} />
        {hasChildren ? (
          <Button
            type="button"
            variant="none"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="size-4 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.entityExpandAction)}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <Button
          type="button"
          variant="none"
          onClick={() => onSelect(entity.id)}
          className="flex h-auto min-w-0 flex-1 items-center justify-start gap-2.5 p-0 text-left"
          {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.entitySelectAction)}
        >
          <span className="text-xs font-mono text-muted-foreground shrink-0 w-16 truncate">{entity.id}</span>
          <span className="text-sm font-medium text-foreground truncate flex-1">{entity.name}</span>
          {typeBadge(entity.type)}
        </Button>
      </div>

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
      setEntities(normalizeC3Entities(res.data))
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
      <div className="flex-1 flex items-center justify-center p-12" {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.root)}>
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
      <div className="flex-1 flex items-center justify-center p-12" {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.root)}>
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <AlertCircle className="size-5 text-destructive" />
          <p className="text-sm text-foreground">{error}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={fetchList}
            className="h-8 gap-1.5 border-0 bg-accent text-accent-foreground hover:bg-accent/80"
            {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.refreshAction)}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  if (entities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12" {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.root)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <Building2 className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No architecture components found</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={fetchList}
            className="h-8 gap-1.5 border-0 bg-accent text-accent-foreground hover:bg-accent/80"
            {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.refreshAction)}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Main view
  // -------------------------------------------------------------------------
  const total = countEntities(entities)

  return (
    <div className="flex flex-col h-full overflow-hidden" {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.root)}>
      {/* Description bar — no heading (tab label already shows "Architecture") */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-sm text-muted-foreground">
          {total} {total === 1 ? "entity" : "entities"} across containers and components
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={fetchList}
          className="size-7 border-0"
          title="Refresh"
          {...getUiIdentityAttributeProps(C3_EXTENSION_UI_DESCRIPTORS.refreshAction)}
        >
          <RefreshCw className="size-3.5" />
        </Button>
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
