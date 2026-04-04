// src/server/transcript-search.ts
import type { TranscriptEntry, NormalizedToolCall } from "../shared/types"
import type { SearchResult, SearchDocumentKind } from "../shared/project-agent-types"
import { BM25Index } from "./bm25"

interface IndexedEntry {
  chatId: string
  timestamp: string
  kind: SearchDocumentKind
  text: string
}

function extractTextFromEntry(entry: TranscriptEntry): { text: string; kind: SearchDocumentKind } | null {
  switch (entry.kind) {
    case "user_prompt":
      return { text: entry.content, kind: "user_prompt" }
    case "assistant_text":
      return { text: entry.text, kind: "assistant_text" }
    case "tool_call":
      return { text: toolCallToText(entry.tool), kind: "tool_call" }
    case "tool_result":
      return { text: typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content), kind: "tool_result" }
    default:
      return null
  }
}

function toolCallToText(tool: NormalizedToolCall): string {
  const parts: string[] = [tool.toolKind]
  const input = tool.input as Record<string, unknown>
  if (typeof input.filePath === "string") parts.push(input.filePath)
  if (typeof input.path === "string") parts.push(input.path)
  if (typeof input.command === "string") parts.push(input.command)
  if (typeof input.pattern === "string") parts.push(input.pattern)
  if (typeof input.query === "string") parts.push(input.query)
  return parts.join(" ")
}

export class TranscriptSearchIndex {
  private readonly bm25 = new BM25Index<string>()
  private readonly entries = new Map<string, IndexedEntry>()

  get size(): number {
    return this.entries.size
  }

  addEntry(chatId: string, entry: TranscriptEntry): void {
    const extracted = extractTextFromEntry(entry)
    if (!extracted) return

    const docId = entry._id
    const indexed: IndexedEntry = {
      chatId,
      timestamp: new Date(entry.createdAt).toISOString(),
      kind: extracted.kind,
      text: extracted.text,
    }
    this.entries.set(docId, indexed)
    this.bm25.add(docId, extracted.text)
  }

  search(query: string, limit = 10): SearchResult[] {
    const bm25Results = this.bm25.search(query, limit)
    return bm25Results
      .map((r) => {
        const entry = this.entries.get(r.id)
        if (!entry) return null
        return {
          chatId: entry.chatId,
          timestamp: entry.timestamp,
          kind: entry.kind,
          fragment: entry.text.slice(0, 300),
          score: r.score,
        }
      })
      .filter((r): r is SearchResult => r !== null)
  }
}
