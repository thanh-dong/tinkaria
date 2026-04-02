import { memo, useEffect, useRef, useState } from "react"

const EMBED_LANGUAGES = new Set(["mermaid", "d2", "svg"])

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

  if (format === "svg") {
    return <SvgEmbed source={source} />
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

type SvgParseResult =
  | {
      ok: true
      markup: string
    }
  | {
      ok: false
      message: string
    }

function parseSvgMarkup(source: string): SvgParseResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return { ok: false, message: "SVG render error" }
  }

  const stack: string[] = []
  let cursor = 0
  let rootStart = -1
  let rootEnd = -1

  while (cursor < trimmed.length) {
    const next = trimmed[cursor]

    if (next !== "<") {
      const textEnd = trimmed.indexOf("<", cursor)
      const text = trimmed.slice(cursor, textEnd === -1 ? trimmed.length : textEnd)
      const insideRoot = stack.length > 0

      if (!insideRoot && text.trim()) {
        return { ok: false, message: "SVG render error" }
      }

      cursor = textEnd === -1 ? trimmed.length : textEnd
      continue
    }

    if (trimmed.startsWith("<!--", cursor)) {
      const end = trimmed.indexOf("-->", cursor + 4)
      if (end === -1) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 3
      continue
    }

    if (trimmed.startsWith("<![CDATA[", cursor)) {
      const end = trimmed.indexOf("]]>", cursor + 9)
      if (end === -1 || stack.length === 0) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 3
      continue
    }

    if (trimmed.startsWith("<?", cursor)) {
      const end = trimmed.indexOf("?>", cursor + 2)
      if (end === -1 || rootStart !== -1) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 2
      continue
    }

    if (trimmed.slice(cursor, cursor + 9).toUpperCase() === "<!DOCTYPE") {
      const end = findTagEnd(trimmed, cursor + 9)
      if (end === -1 || rootStart !== -1) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 1
      continue
    }

    const tag = readSvgTag(trimmed, cursor)
    if (!tag) {
      return { ok: false, message: "SVG render error" }
    }

    const { name, closing, selfClosing, end } = tag
    if (closing) {
      const expected = stack.pop()
      if (expected !== name) {
        return { ok: false, message: "SVG render error" }
      }

      if (name === "svg" && stack.length === 0) {
        rootEnd = end
      }

      cursor = end
      continue
    }

    if (rootStart === -1) {
      if (name !== "svg" || selfClosing) {
        return { ok: false, message: "SVG render error" }
      }
      rootStart = cursor
    } else if (rootEnd !== -1) {
      return { ok: false, message: "SVG render error" }
    }

    if (!selfClosing) {
      stack.push(name)
    }

    cursor = end
  }

  if (rootStart === -1 || rootEnd === -1 || stack.length !== 0) {
    return { ok: false, message: "SVG render error" }
  }

  return { ok: true, markup: trimmed.slice(rootStart, rootEnd) }
}

function findTagEnd(source: string, start: number): number {
  let quote: string | null = null

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) {
        quote = null
      } else if (char === "\\") {
        index += 1
      }
      continue
    }

    if (char === "\"" || char === "'") {
      quote = char
      continue
    }

    if (char === ">") {
      return index
    }
  }

  return -1
}

function readSvgTag(
  source: string,
  start: number
): { name: string; closing: boolean; selfClosing: boolean; end: number } | null {
  const end = findTagEnd(source, start + 1)
  if (end === -1) {
    return null
  }

  const raw = source.slice(start + 1, end).trim()
  if (!raw) {
    return null
  }

  const closing = raw.startsWith("/")
  const body = closing ? raw.slice(1).trim() : raw
  const nameMatch = body.match(/^([A-Za-z][\w:-]*)\b/)
  if (!nameMatch) {
    return null
  }

  const name = nameMatch[1]
  const selfClosing = !closing && /\/\s*$/.test(body)
  return { name, closing, selfClosing, end: end + 1 }
}

function SvgEmbed({ source }: { source: string }) {
  const [mode, setMode] = useState<"render" | "source">("render")
  const parsed = parseSvgMarkup(source)
  const svgDataUrl = parsed.ok
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(parsed.markup)}`
    : null

  return (
    <div className="space-y-3 p-3">
      <div aria-label="SVG display mode" className="flex items-center gap-1 rounded-md bg-muted/50 p-1 text-xs">
        <button
          type="button"
          aria-pressed={mode === "render"}
          onClick={() => setMode("render")}
          className={`rounded px-2 py-1 transition-colors ${
            mode === "render" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Render
        </button>
        <button
          type="button"
          aria-pressed={mode === "source"}
          onClick={() => setMode("source")}
          className={`rounded px-2 py-1 transition-colors ${
            mode === "source" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Source
        </button>
      </div>

      {mode === "render" ? (
        parsed.ok ? (
          <>
            <img
              data-svg-render="true"
              alt=""
              src={svgDataUrl ?? undefined}
              className="block h-auto max-h-[320px] max-w-full rounded-md border border-border/60 bg-background p-3 w-auto"
            />
            <script type="text/plain" data-svg-source="true">
              {source}
            </script>
          </>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-destructive">{parsed.message}</div>
            <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
              {source}
            </pre>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {!parsed.ok ? (
            <div className="text-xs text-destructive">{parsed.message}</div>
          ) : null}
          <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
            {source}
          </pre>
        </div>
      )}
    </div>
  )
}

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
