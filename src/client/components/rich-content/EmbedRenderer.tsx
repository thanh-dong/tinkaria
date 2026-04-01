import { memo, useEffect, useRef, useState } from "react"

const EMBED_LANGUAGES = new Set(["mermaid", "d2"])

export function isEmbedLanguage(language: string | null): boolean {
  if (language === null) return false
  return EMBED_LANGUAGES.has(language)
}

interface EmbedRendererProps {
  format: string
  source: string
}

export const EmbedRenderer = memo(function EmbedRenderer({
  format,
  source,
}: EmbedRendererProps) {
  if (format === "mermaid") {
    return <MermaidDiagram source={source} />
  }

  // D2 and other formats: show source as fallback
  return (
    <div className="p-3 text-xs font-mono">
      <div className="mb-2 text-muted-foreground text-[10px] uppercase tracking-wider">
        {format} diagram (source)
      </div>
      <pre className="whitespace-pre-wrap break-all text-foreground">
        {source}
      </pre>
    </div>
  )
})

function MermaidDiagram({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const container = containerRef.current
      if (!container) return

      try {
        const mermaid = await import("mermaid")
        mermaid.default.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
        })

        const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`
        const { svg } = await mermaid.default.render(id, source)
        if (!cancelled && container) {
          container.innerHTML = svg
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [source])

  if (error) {
    return (
      <div className="p-3">
        <div className="mb-1 text-xs text-destructive">Diagram render error</div>
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
          {source}
        </pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-mermaid-source={source}
      className="flex items-center justify-center p-3 min-h-[60px] [&_svg]:max-w-full"
    />
  )
}
