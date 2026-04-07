import type { TranscriptEntry } from "../shared/types"
import { getForkPreset } from "../shared/fork-presets"
import { QuickResponseAdapter } from "./quick-response"

const FORK_PROMPT_SCHEMA = {
  type: "object",
  properties: {
    prompt: { type: "string" },
  },
  required: ["prompt"],
  additionalProperties: false,
} as const

const MAX_FORK_TRANSCRIPT_LINES = 32
const MAX_FORK_TRANSCRIPT_CHARS = 14_000
const MAX_FORK_LINE_CHARS = 700
const MAX_FORK_PROMPT_CHARS = 4_000

function truncateLine(text: string, limit = MAX_FORK_LINE_CHARS) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function normalizeForkIntent(intent: string): string {
  return intent.replace(/\s+/g, " ").trim().slice(0, 1_000)
}

function normalizeGeneratedForkPrompt(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_FORK_PROMPT_CHARS)
    .trim()
  return normalized || null
}

function toForkTranscriptLine(entry: TranscriptEntry): string | null {
  switch (entry.kind) {
    case "user_prompt":
      return `User: ${truncateLine(entry.content)}`
    case "assistant_text":
      return `Assistant: ${truncateLine(entry.text)}`
    case "compact_summary":
      return `Summary: ${truncateLine(entry.summary)}`
    case "result":
      return `${entry.isError ? "Result error" : "Result"}: ${truncateLine(entry.result)}`
    default:
      return null
  }
}

export function buildForkTranscriptExcerpt(entries: TranscriptEntry[]): string {
  const lines = entries
    .map(toForkTranscriptLine)
    .filter((line): line is string => Boolean(line))

  if (lines.length === 0) return "No prior transcript context was available."

  const selected = lines.slice(-MAX_FORK_TRANSCRIPT_LINES)
  const omittedCount = lines.length - selected.length
  const header = omittedCount > 0
    ? [`Recent source transcript excerpt. Older relevant lines omitted: ${omittedCount}.`]
    : ["Recent source transcript excerpt:"]

  const combined = [...header, ...selected]
  let serialized = combined.join("\n")
  if (serialized.length <= MAX_FORK_TRANSCRIPT_CHARS) return serialized

  const trimmed: string[] = []
  let remaining = MAX_FORK_TRANSCRIPT_CHARS - header[0]!.length - 1
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const line = selected[index]!
    const cost = line.length + 1
    if (remaining - cost < 0) break
    trimmed.unshift(line)
    remaining -= cost
  }

  return [...header, ...trimmed].join("\n")
}

export async function generateForkPromptForChat(
  forkIntent: string,
  entries: TranscriptEntry[],
  cwd: string,
  presetId?: string,
  adapter = new QuickResponseAdapter(),
): Promise<string> {
  const preset = getForkPreset(presetId)
  const normalizedIntent = normalizeForkIntent(forkIntent) || preset?.defaultIntent || ""
  const transcriptExcerpt = buildForkTranscriptExcerpt(entries)

  const result = await adapter.generateStructured<string>({
    cwd,
    task: "fork session prompt generation",
    prompt: [
      "Write the first user message for a new independent forked coding session.",
      "The new session should be able to start work without reading the original chat.",
      "Use the user's fork intent as the highest-priority instruction.",
      preset
        ? `Selected fork preset: ${preset.label}. ${preset.generatorHint}`
        : "No explicit fork preset was selected. Infer the cleanest framing from the user intent and source context.",
      "Carry forward only the context from the source transcript that is genuinely needed.",
      "Prefer a concise markdown brief with these sections when relevant: Objective, Relevant Context, Constraints, Open Questions.",
      "Do not mention parent/child chats, delegation, orchestration, or that this content was summarized from another session.",
      "Do not return JSON or code fences.",
      "",
      `Fork intent:\n${normalizedIntent || "Continue the most useful independent next step."}`,
      "",
      transcriptExcerpt,
    ].join("\n"),
    schema: FORK_PROMPT_SCHEMA,
    parse: (value) => {
      const output = value && typeof value === "object" ? value as { prompt?: unknown } : {}
      return normalizeGeneratedForkPrompt(output.prompt)
    },
  })

  return result ?? normalizedIntent
}
