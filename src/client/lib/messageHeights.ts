import { prepare, layout, type PreparedText } from "@chenglou/pretext"
import type { HydratedTranscriptMessage, TranscriptRenderUnit } from "../../shared/types"

// CSS constants matching prose-sm + message wrappers
const BODY_FONT = "14px Body"
const LINE_HEIGHT = 24 // 14px * 1.714
const MESSAGE_PADDING_BOTTOM = 20 // pb-5 wrapper
const USER_BUBBLE_PADDING_VERTICAL = 12 // py-1.5 = 6px * 2
const USER_BUBBLE_PADDING_HORIZONTAL = 28 // px-3.5 = 14px * 2
const USER_BUBBLE_WIDTH_RATIO = 0.8 // max-w-[80%] (sm+)
const PROSE_PARAGRAPH_MARGIN = 16 // prose-sm: ~1.143em * 14px between paragraphs
const DEFAULT_FALLBACK = 80

// Fallback heights for non-text message kinds
const KIND_FALLBACKS: Partial<Record<HydratedTranscriptMessage["kind"], number>> = {
  system_init: 48,
  account_info: 0,
  result: 40,
  status: 32,
  compact_boundary: 40,
  context_cleared: 40,
  compact_summary: 56,
  interrupted: 32,
  tool: 56,
  unknown: 80,
}

const TOOL_GROUP_FALLBACK = 64
const WIP_BLOCK_FALLBACK = 72
const MAX_CACHE_SIZE = 500

// LRU cache: Map preserves insertion order, delete+set moves to end
const preparedCache = new Map<string, PreparedText>()

function getPrepared(text: string, id: string, font: string, options?: { whiteSpace?: "normal" | "pre-wrap" }): PreparedText {
  const cached = preparedCache.get(id)
  if (cached) {
    preparedCache.delete(id)
    preparedCache.set(id, cached)
    return cached
  }

  const prepared = prepare(text, font, options)
  preparedCache.set(id, prepared)

  if (preparedCache.size > MAX_CACHE_SIZE) {
    const oldest = preparedCache.keys().next().value
    if (oldest !== undefined) preparedCache.delete(oldest)
  }

  return prepared
}

function countParagraphBreaks(text: string): number {
  let count = 0
  let i = 0
  while (i < text.length) {
    if (text[i] === "\n" && i + 1 < text.length && text[i + 1] === "\n") {
      count++
      i += 2
      while (i < text.length && text[i] === "\n") i++
    } else {
      i++
    }
  }
  return count
}

export function estimateMessageHeight(
  message: HydratedTranscriptMessage,
  containerWidth: number,
  fontReady: boolean,
): number {
  if (!fontReady) return DEFAULT_FALLBACK

  if (message.kind === "assistant_text") {
    const prepared = getPrepared(message.text, message.id, BODY_FONT)
    const result = layout(prepared, containerWidth, LINE_HEIGHT)
    // Approximate prose-sm paragraph margins (16px gap per paragraph break)
    const paragraphGaps = countParagraphBreaks(message.text)
    return result.height + paragraphGaps * PROSE_PARAGRAPH_MARGIN + MESSAGE_PADDING_BOTTOM
  }

  if (message.kind === "user_prompt") {
    const bubbleWidth = containerWidth * USER_BUBBLE_WIDTH_RATIO - USER_BUBBLE_PADDING_HORIZONTAL
    const prepared = getPrepared(message.content, message.id, BODY_FONT, { whiteSpace: "pre-wrap" })
    const result = layout(prepared, bubbleWidth, LINE_HEIGHT)
    return result.height + USER_BUBBLE_PADDING_VERTICAL + MESSAGE_PADDING_BOTTOM
  }

  return KIND_FALLBACKS[message.kind] ?? DEFAULT_FALLBACK
}

export type RenderItem = TranscriptRenderUnit

export function estimateRenderItemHeight(
  item: RenderItem,
  containerWidth: number,
  fontReady: boolean,
): number {
  if (item.kind === "tool_group") return TOOL_GROUP_FALLBACK
  if (item.kind === "wip_block") return WIP_BLOCK_FALLBACK
  if (item.kind === "standalone_tool") return estimateMessageHeight(item.tool, containerWidth, fontReady)
  if (item.kind === "artifact") return estimateMessageHeight(item.artifact, containerWidth, fontReady)
  return estimateMessageHeight(item.message, containerWidth, fontReady)
}

export function clearHeightCache(): void {
  preparedCache.clear()
}
