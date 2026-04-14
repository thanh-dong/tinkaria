import { useCallback, useEffect, useState } from "react"
import { ChevronRight, FileText, Loader2, ScrollText, Users } from "lucide-react"
import { cn } from "../../lib/utils"
import type { ExtensionProps } from "../../../shared/extension-types"

// ── Types ────────────────────────────────────────────────

interface Section {
  heading: string
  content: string
}

interface Skill {
  name: string
  filename: string
  content: string
}

interface AgentsData {
  claudeMd: { sections: Section[] }
  skills: { skills: Skill[] }
  agentsMd: { found: boolean; sections: Section[] }
}

// ── Collapsible section ──────────────────────────────────

function CollapsibleItem({
  id,
  label,
  content,
  expanded,
  onToggle,
}: {
  id: string
  label: string
  content: string
  expanded: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
        onClick={() => onToggle(id)}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
        <span className="text-sm font-medium text-foreground truncate">
          {label}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pl-8">
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Card wrapper ─────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
        <Icon className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────

export default function AgentsExtension({ localPath }: ExtensionProps) {
  const [data, setData] = useState<AgentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)

    const q = encodeURIComponent(localPath)

    Promise.all([
      fetch(`/api/ext/agents/claude-md?projectPath=${q}`).then((r) => {
        if (!r.ok) throw new Error(`claude-md: ${r.status}`)
        return r.json() as Promise<{ sections: Section[] }>
      }),
      fetch(`/api/ext/agents/skills?projectPath=${q}`).then((r) => {
        if (!r.ok) throw new Error(`skills: ${r.status}`)
        return r.json() as Promise<{ skills: Skill[] }>
      }),
      fetch(`/api/ext/agents/agents-md?projectPath=${q}`).then((r) => {
        if (!r.ok) throw new Error(`agents-md: ${r.status}`)
        return r.json() as Promise<{ found: boolean; sections: Section[] }>
      }),
    ])
      .then(([claudeMd, skills, agentsMd]) => {
        setData({ claudeMd, skills, agentsMd })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [localPath])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">Failed to load agent data: {error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* CLAUDE.md */}
      <SectionCard icon={FileText} title="CLAUDE.md">
        {data.claudeMd.sections.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground italic">
            No CLAUDE.md found
          </p>
        ) : (
          data.claudeMd.sections.map((s, i) => (
            <CollapsibleItem
              key={`claude-${i}`}
              id={`claude-${i}`}
              label={s.heading || "(preamble)"}
              content={s.content}
              expanded={expandedSections.has(`claude-${i}`)}
              onToggle={toggle}
            />
          ))
        )}
      </SectionCard>

      {/* Skills */}
      <SectionCard icon={ScrollText} title="Skills">
        {data.skills.skills.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground italic">
            No skills found
          </p>
        ) : (
          data.skills.skills.map((s, i) => (
            <CollapsibleItem
              key={`skill-${i}`}
              id={`skill-${i}`}
              label={s.filename}
              content={s.content}
              expanded={expandedSections.has(`skill-${i}`)}
              onToggle={toggle}
            />
          ))
        )}
      </SectionCard>

      {/* Agents */}
      <SectionCard icon={Users} title="Agents">
        {!data.agentsMd.found ? (
          <p className="px-3 py-3 text-sm text-muted-foreground italic">
            No agents.md found
          </p>
        ) : data.agentsMd.sections.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground italic">
            agents.md is empty
          </p>
        ) : (
          data.agentsMd.sections.map((s, i) => (
            <CollapsibleItem
              key={`agent-${i}`}
              id={`agent-${i}`}
              label={s.heading || "(preamble)"}
              content={s.content}
              expanded={expandedSections.has(`agent-${i}`)}
              onToggle={toggle}
            />
          ))
        )}
      </SectionCard>
    </div>
  )
}
