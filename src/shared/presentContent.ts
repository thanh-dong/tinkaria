const PRESENT_CONTENT_FORMAT_ALIASES = new Map<string, string>([
  ["pugjs", "pug"],
  ["jade", "pug"],
])

const CANONICAL_PRESENT_CONTENT_FORMATS = new Set([
  "markdown",
  "mermaid",
  "d2",
  "svg",
  "iframe",
  "diashort",
  "html",
  "pug",
])

export function normalizePresentContentFormat(format: string): string {
  const trimmed = format.trim()
  if (!trimmed) return "text"

  const lowered = trimmed.toLowerCase()
  const aliased = PRESENT_CONTENT_FORMAT_ALIASES.get(lowered)
  if (aliased) return aliased
  if (CANONICAL_PRESENT_CONTENT_FORMATS.has(lowered)) return lowered
  return trimmed
}
