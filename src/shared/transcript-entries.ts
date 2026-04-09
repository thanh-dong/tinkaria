import type { NormalizedToolCall, TranscriptEntry } from "./types"

export function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
  createdAt = Date.now()
): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt,
    ...entry,
  } as TranscriptEntry
}

export function discardedToolResult(
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
) {
  if (tool.toolKind === "ask_user_question") {
    return {
      discarded: true,
      answers: {},
    }
  }

  return {
    discarded: true,
  }
}
