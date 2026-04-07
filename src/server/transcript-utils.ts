import type { TranscriptEntry } from "../shared/types"

/** Collapse whitespace and truncate a single line to `limit` characters. */
export function truncateLine(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

/** Convert a transcript entry into a labeled single line, or null for non-displayable kinds. */
export function toTranscriptLine(entry: TranscriptEntry, lineCharLimit: number): string | null {
  switch (entry.kind) {
    case "user_prompt":
      return `User: ${truncateLine(entry.content, lineCharLimit)}`
    case "assistant_text":
      return `Assistant: ${truncateLine(entry.text, lineCharLimit)}`
    case "compact_summary":
      return `Summary: ${truncateLine(entry.summary, lineCharLimit)}`
    case "result":
      return `${entry.isError ? "Result error" : "Result"}: ${truncateLine(entry.result, lineCharLimit)}`
    default:
      return null
  }
}

const PROMPT_SCHEMA = {
  type: "object",
  properties: {
    prompt: { type: "string" },
  },
  required: ["prompt"],
  additionalProperties: false,
} as const

export { PROMPT_SCHEMA }

/** Collapse whitespace and clamp intent text to 1000 characters. */
export function normalizeIntent(intent: string): string {
  return intent.replace(/\s+/g, " ").trim().slice(0, 1_000)
}

/** Normalize LLM-generated prompt output, clamping to maxChars. Returns null for empty/invalid. */
export function normalizeGeneratedPrompt(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars)
    .trim()
  return normalized || null
}
