import { useEffect, useState } from "react"
import { AlertCircle, Loader2, Package } from "lucide-react"
import type { ExtensionProps } from "../../../shared/extension-types"

const LOG_PREFIX = "[CodeExtension]"

interface ManifestResult {
  language: string
  name: string
  version: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  error?: string
}

interface ManifestResponse {
  manifests: ManifestResult[]
}

const LANGUAGE_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  javascript: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "JavaScript" },
  typescript: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "TypeScript" },
  rust: { bg: "bg-orange-500/20", text: "text-orange-400", label: "Rust" },
  go: { bg: "bg-cyan-500/20", text: "text-cyan-400", label: "Go" },
  python: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Python" },
}

function LanguageBadge({ language }: { language: string }) {
  const badge = LANGUAGE_BADGES[language] ?? {
    bg: "bg-zinc-500/20",
    text: "text-zinc-400",
    label: language,
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
      {badge.label}
    </span>
  )
}

function DepsTable({ deps, label }: { deps: Record<string, string>; label: string }) {
  const sorted = Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))
  if (sorted.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground mb-2">
        {label} ({sorted.length})
      </h3>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {sorted.map(([name, version]) => (
              <tr key={name} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5 text-foreground">{name}</td>
                <td className="px-3 py-1.5 text-muted-foreground font-mono text-right">{version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScriptsTable({ scripts }: { scripts: Record<string, string> }) {
  const entries = Object.entries(scripts)
  if (entries.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground mb-2">Scripts</h3>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([name, command]) => (
              <tr key={name} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5 text-foreground font-medium whitespace-nowrap">{name}</td>
                <td className="px-3 py-1.5 text-muted-foreground font-mono">{command}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ManifestCard({ manifest }: { manifest: ManifestResult }) {
  const hasScripts = Object.keys(manifest.scripts).length > 0
  const hasDeps = Object.keys(manifest.dependencies).length > 0
  const hasDevDeps = Object.keys(manifest.devDependencies).length > 0

  if (manifest.error) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <LanguageBadge language={manifest.language} />
          <span className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="size-3.5" />
            Parse error
          </span>
        </div>
        <p className="text-sm text-muted-foreground font-mono">{manifest.error}</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <LanguageBadge language={manifest.language} />
        {manifest.name && (
          <span className="text-sm font-semibold text-foreground">{manifest.name}</span>
        )}
        {manifest.version && (
          <span className="text-sm text-muted-foreground font-mono">v{manifest.version}</span>
        )}
      </div>

      {hasScripts && <ScriptsTable scripts={manifest.scripts} />}
      {hasDeps && <DepsTable deps={manifest.dependencies} label="Dependencies" />}
      {hasDevDeps && <DepsTable deps={manifest.devDependencies} label="Dev Dependencies" />}

      {!hasScripts && !hasDeps && !hasDevDeps && (
        <p className="text-sm text-muted-foreground">No scripts or dependencies found.</p>
      )}
    </div>
  )
}

export default function CodeExtension({ localPath }: ExtensionProps) {
  const [manifests, setManifests] = useState<ManifestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setManifests([])

    fetch(`/api/ext/code/manifest?projectPath=${encodeURIComponent(localPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ManifestResponse>
      })
      .then((data) => {
        setManifests(data.manifests)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(LOG_PREFIX, "Failed to fetch manifests:", msg)
        setError(msg)
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
      <div className="flex flex-col items-center justify-center p-8 gap-2">
        <AlertCircle className="size-5 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load project info</p>
        <p className="text-xs text-muted-foreground font-mono">{error}</p>
      </div>
    )
  }

  if (manifests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-2">
        <Package className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No project manifests found</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      {manifests.map((manifest, i) => (
        <div key={`${manifest.language}-${manifest.name}-${i}`}>
          {i > 0 && <div className="border-t border-border" />}
          <ManifestCard manifest={manifest} />
        </div>
      ))}
    </div>
  )
}
