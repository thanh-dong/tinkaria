import type { PresetDefinition } from "../shared/preset-types"
import type { TranscriptEntry } from "../shared/types"
import type { QuickResponseAdapter } from "./quick-response"
import { normalizeGeneratedPrompt, normalizeIntent, toTranscriptLine, truncateLine } from "./transcript-utils"
import { MAX_MERGE_SESSIONS } from "../shared/merge-presets"

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    compactInstruction: { type: "string" },
    nextInstruction: { type: "string" },
  },
  required: ["compactInstruction", "nextInstruction"],
  additionalProperties: false,
} as const

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
  additionalProperties: false,
} as const

const MAX_ANALYSIS_CHARS = 1_200
const MAX_SOURCE_SUMMARY_CHARS = 2_400
const MAX_FORK_TRANSCRIPT_LINES = 32
const MAX_FORK_TRANSCRIPT_CHARS = 14_000
const MAX_FORK_LINE_CHARS = 700
const MAX_MERGE_TOTAL_CHARS = 14_000
const MERGE_FLOOR_PER_SESSION_CHARS = 500
const MAX_MERGE_LINE_CHARS = 700

export interface SessionSeedSource {
  chatId: string
  entries: TranscriptEntry[]
}

interface SessionSeedIntentPlan {
  compactInstruction: string
  nextInstruction: string
}

function buildForkTranscriptExcerpt(entries: TranscriptEntry[]): string {
  const lines = entries
    .map((entry) => toTranscriptLine(entry, MAX_FORK_LINE_CHARS))
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

function sliceAfterLastContextCleared(entries: TranscriptEntry[]): TranscriptEntry[] {
  let lastClearedIndex = -1
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i]!.kind === "context_cleared") {
      lastClearedIndex = i
      break
    }
  }
  return lastClearedIndex >= 0 ? entries.slice(lastClearedIndex + 1) : entries
}

function buildBudgetedTranscriptExcerpt(entries: TranscriptEntry[], charBudget: number): string {
  const sliced = sliceAfterLastContextCleared(entries)
  const lines = sliced
    .map((entry) => toTranscriptLine(entry, MAX_MERGE_LINE_CHARS))
    .filter((line): line is string => Boolean(line))

  if (lines.length === 0) return "No prior transcript context was available."

  const header = "Recent source transcript excerpt:"
  const headerCost = header.length + 1
  const selected: string[] = []
  let remaining = charBudget - headerCost

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!
    const cost = line.length + 1
    if (remaining - cost < 0) break
    selected.unshift(line)
    remaining -= cost
  }

  if (selected.length === 0) {
    const lastLine = lines[lines.length - 1]!
    const maxLen = Math.max(0, charBudget - headerCost - 1)
    if (maxLen > 0) {
      selected.push(truncateLine(lastLine, maxLen))
    } else {
      return "No prior transcript context was available."
    }
  }

  const omittedCount = lines.length - selected.length
  const finalHeader = omittedCount > 0
    ? `Recent source transcript excerpt. Older relevant lines omitted: ${omittedCount}.`
    : header

  return [finalHeader, ...selected].join("\n")
}

function computeUsableLength(entries: TranscriptEntry[]): number {
  const sliced = sliceAfterLastContextCleared(entries)
  return sliced
    .map((entry) => toTranscriptLine(entry, MAX_MERGE_LINE_CHARS))
    .filter((line): line is string => Boolean(line))
    .reduce((sum, line) => sum + line.length, 0)
}

function allocateSessionBudgets(sources: SessionSeedSource[]): number[] {
  if (sources.length > MAX_MERGE_SESSIONS) {
    throw new Error(`Cannot compact more than ${MAX_MERGE_SESSIONS} sessions (got ${sources.length})`)
  }

  const usableLengths = sources.map((source) => computeUsableLength(source.entries))
  const nonEmptyCount = usableLengths.filter((length) => length > 0).length
  if (nonEmptyCount === 0) return usableLengths.map(() => 0)

  const totalFloor = nonEmptyCount * MERGE_FLOOR_PER_SESSION_CHARS
  const remainder = Math.max(0, MAX_MERGE_TOTAL_CHARS - totalFloor)
  const totalUsable = usableLengths.reduce((sum, length) => sum + length, 0)

  return usableLengths.map((length) => {
    if (length === 0) return 0
    const proportional = totalUsable > 0
      ? Math.floor(remainder * (length / totalUsable))
      : Math.floor(remainder / nonEmptyCount)
    return MERGE_FLOOR_PER_SESSION_CHARS + proportional
  })
}

function getFallbackInstruction(intent: string, preset?: PresetDefinition | null): string {
  return normalizeIntent(intent) || preset?.defaultIntent || "Continue with the most useful verified next step."
}

async function analyzeSessionSeedIntent(args: {
  mode: "fork" | "merge"
  intent: string
  preset?: PresetDefinition | null
  cwd: string
  adapter: QuickResponseAdapter
}): Promise<SessionSeedIntentPlan> {
  const fallbackInstruction = getFallbackInstruction(args.intent, args.preset)
  const result = await args.adapter.generateStructured<SessionSeedIntentPlan>({
    cwd: args.cwd,
    task: `${args.mode} session seed analysis`,
    prompt: [
      "Analyze the user's instruction for preparing a new coding session.",
      "Return two fields only:",
      "compactInstruction: how to compact the selected source context.",
      "nextInstruction: what the new session should do after compaction.",
      "Keep both concise, concrete, and execution-oriented.",
      "Do not mention orchestration, parent or child sessions, or the compaction step itself.",
      args.preset ? `Selected preset: ${args.preset.label}. ${args.preset.generatorHint}` : "No explicit preset was selected.",
      "",
      `User instruction:\n${fallbackInstruction}`,
    ].join("\n"),
    schema: ANALYSIS_SCHEMA,
    parse: (value) => {
      const output = value && typeof value === "object"
        ? value as { compactInstruction?: unknown; nextInstruction?: unknown }
        : {}
      const compactInstruction = normalizeGeneratedPrompt(output.compactInstruction, MAX_ANALYSIS_CHARS)
      const nextInstruction = normalizeGeneratedPrompt(output.nextInstruction, MAX_ANALYSIS_CHARS)
      if (!compactInstruction || !nextInstruction) return null
      return { compactInstruction, nextInstruction }
    },
  })

  return result ?? {
    compactInstruction: fallbackInstruction,
    nextInstruction: fallbackInstruction,
  }
}

function buildSourceExcerpt(source: SessionSeedSource, sources: SessionSeedSource[]): string {
  if (sources.length <= 1) return buildForkTranscriptExcerpt(source.entries)
  const budgets = allocateSessionBudgets(sources)
  const sourceIndex = sources.findIndex((candidate) => candidate.chatId === source.chatId)
  return buildBudgetedTranscriptExcerpt(source.entries, budgets[sourceIndex] ?? 0)
}

async function compactSourceContext(args: {
  source: SessionSeedSource
  sources: SessionSeedSource[]
  compactInstruction: string
  cwd: string
  adapter: QuickResponseAdapter
}): Promise<{ label: string; summary: string }> {
  const excerpt = buildSourceExcerpt(args.source, args.sources)
  const fallbackSummary = excerpt.slice(0, MAX_SOURCE_SUMMARY_CHARS).trim()

  const result = await args.adapter.generateStructured<string>({
    cwd: args.cwd,
    task: "session context compaction",
    prompt: [
      "Compact this transcript for reuse in a new coding session.",
      `Optimize the compaction for this goal: ${args.compactInstruction}`,
      "Preserve exact file names, symbols, commands, constraints, and open questions when they are present and proven.",
      "Drop filler, repetition, and orchestration wording.",
      "Prefer concise markdown with sections like Relevant Context, Constraints, Evidence, and Open Questions when useful.",
      "",
      excerpt,
    ].join("\n"),
    schema: SUMMARY_SCHEMA,
    parse: (value) => {
      const output = value && typeof value === "object" ? value as { summary?: unknown } : {}
      return normalizeGeneratedPrompt(output.summary, MAX_SOURCE_SUMMARY_CHARS)
    },
  })

  return {
    label: args.source.chatId,
    summary: result ?? (fallbackSummary || "No prior transcript context was available."),
  }
}

function buildFinalSeedPrompt(nextInstruction: string, summaries: Array<{ label: string; summary: string }>): string {
  const sections = [`## Objective\n${nextInstruction}`]

  if (summaries.length === 1) {
    sections.push(`## Relevant Context\n${summaries[0]!.summary}`)
  } else {
    sections.push([
      "## Compacted Contexts",
      ...summaries.map((summary) => `### ${summary.label}\n${summary.summary}`),
    ].join("\n\n"))
  }

  sections.push(
    "## Constraints\nPreserve proven constraints from the context above. Call out contradictions or missing evidence before making risky changes.",
  )
  sections.push("## Next Step\nStart directly on the objective using the compacted context above.")

  return sections.join("\n\n")
}

export async function buildSessionSeedPrompt(args: {
  mode: "fork" | "merge"
  intent: string
  preset?: PresetDefinition | null
  sources: SessionSeedSource[]
  cwd: string
  adapter: QuickResponseAdapter
}): Promise<string> {
  const plan = await analyzeSessionSeedIntent({
    mode: args.mode,
    intent: args.intent,
    preset: args.preset,
    cwd: args.cwd,
    adapter: args.adapter,
  })

  const summaries = await Promise.all(
    args.sources.map((source) => compactSourceContext({
      source,
      sources: args.sources,
      compactInstruction: plan.compactInstruction,
      cwd: args.cwd,
      adapter: args.adapter,
    })),
  )

  return buildFinalSeedPrompt(plan.nextInstruction, summaries)
}
