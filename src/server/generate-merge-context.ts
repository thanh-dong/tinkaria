import type { TranscriptEntry } from "../shared/types"
import { getMergePreset, MAX_MERGE_SESSIONS } from "../shared/merge-presets"
import { QuickResponseAdapter } from "./quick-response"
import { toTranscriptLine, truncateLine } from "./transcript-utils"
import { buildSessionSeedPrompt } from "./session-seed"

const LOG_PREFIX = "[generate-merge-context]"

export const MAX_MERGE_TOTAL_CHARS = 14_000
export const MERGE_FLOOR_PER_SESSION_CHARS = 500
const MAX_MERGE_LINE_CHARS = 700

/** Slice entries to only those after the last context_cleared boundary, if any. */
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

/** Build a bounded transcript excerpt that respects a custom character budget. */
export function buildBudgetedTranscriptExcerpt(
  entries: TranscriptEntry[],
  charBudget: number,
): string {
  const sliced = sliceAfterLastContextCleared(entries)

  const lines = sliced
    .map((e) => toTranscriptLine(e, MAX_MERGE_LINE_CHARS))
    .filter((line): line is string => Boolean(line))

  if (lines.length === 0) return "No prior transcript context was available."

  const header = "Recent source transcript excerpt:"
  const headerCost = header.length + 1 // +1 for the newline

  // Take from the end (most recent first) until budget is exhausted
  const selected: string[] = []
  let remaining = charBudget - headerCost
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!
    const cost = line.length + 1 // +1 for the newline separator
    if (remaining - cost < 0) break
    selected.unshift(line)
    remaining -= cost
  }

  if (selected.length === 0) {
    // Even a single line doesn't fit; truncate the last line to fit
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

/** Compute how many usable transcript characters each session contributes. */
function computeUsableLength(entries: TranscriptEntry[]): number {
  const sliced = sliceAfterLastContextCleared(entries)
  return sliced
    .map((e) => toTranscriptLine(e, MAX_MERGE_LINE_CHARS))
    .filter((line): line is string => Boolean(line))
    .reduce((sum, line) => sum + line.length, 0)
}

/** Allocate character budgets across sessions proportionally to their content size.
 * Empty sessions get 0. Every non-empty session gets at least MERGE_FLOOR_PER_SESSION_CHARS. */
export function allocateSessionBudgets(
  sessions: { entries: TranscriptEntry[] }[],
): number[] {
  if (sessions.length > MAX_MERGE_SESSIONS) {
    throw new Error(
      `${LOG_PREFIX} Cannot merge more than ${MAX_MERGE_SESSIONS} sessions (got ${sessions.length})`,
    )
  }

  const usableLengths = sessions.map((s) => computeUsableLength(s.entries))
  const nonEmptyCount = usableLengths.filter((len) => len > 0).length

  if (nonEmptyCount === 0) {
    return usableLengths.map(() => 0)
  }

  const totalFloor = nonEmptyCount * MERGE_FLOOR_PER_SESSION_CHARS
  const remainder = Math.max(0, MAX_MERGE_TOTAL_CHARS - totalFloor)
  const totalUsable = usableLengths.reduce((sum, len) => sum + len, 0)

  return usableLengths.map((len) => {
    if (len === 0) return 0
    const proportional = totalUsable > 0
      ? Math.floor(remainder * (len / totalUsable))
      : Math.floor(remainder / nonEmptyCount)
    return MERGE_FLOOR_PER_SESSION_CHARS + proportional
  })
}

/** Generate a merge prompt that synthesizes context from multiple sessions.
 * Requires 2–MAX_MERGE_SESSIONS sessions. Returns the generated prompt or the
 * normalized intent as a fallback if the adapter fails. */
export async function generateMergePromptForChats(
  mergeIntent: string,
  sessions: { chatId: string; entries: TranscriptEntry[] }[],
  cwd: string,
  presetId?: string,
  adapter: QuickResponseAdapter = new QuickResponseAdapter(),
): Promise<string> {
  if (sessions.length < 1) {
    throw new Error(
      `${LOG_PREFIX} Merge requires at least 1 session (got ${sessions.length})`,
    )
  }
  if (sessions.length > MAX_MERGE_SESSIONS) {
    throw new Error(
      `${LOG_PREFIX} Cannot merge more than ${MAX_MERGE_SESSIONS} sessions (got ${sessions.length})`,
    )
  }

  const preset = getMergePreset(presetId)
  return buildSessionSeedPrompt({
    mode: "merge",
    intent: mergeIntent,
    preset,
    sources: sessions,
    cwd,
    adapter,
  })
}
