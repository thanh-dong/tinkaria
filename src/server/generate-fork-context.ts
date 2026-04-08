import type { TranscriptEntry } from "../shared/types"
import { getForkPreset } from "../shared/fork-presets"
import { QuickResponseAdapter } from "./quick-response"
import { toTranscriptLine } from "./transcript-utils"
import { buildSessionSeedPrompt } from "./session-seed"

const MAX_FORK_TRANSCRIPT_LINES = 32
const MAX_FORK_TRANSCRIPT_CHARS = 14_000
const MAX_FORK_LINE_CHARS = 700
/** Build a bounded transcript excerpt from a list of transcript entries.
 * Exported for reuse by merge-context generation. */
export function buildForkTranscriptExcerpt(entries: TranscriptEntry[]): string {
  const lines = entries
    .map((e) => toTranscriptLine(e, MAX_FORK_LINE_CHARS))
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
  return buildSessionSeedPrompt({
    mode: "fork",
    intent: forkIntent,
    preset,
    sources: [{ chatId: "current-session", entries }],
    cwd,
    adapter,
  })
}
