import type { IncrementalHydrator } from "../lib/parseTranscript"
import type { HydratedTranscriptMessage } from "../../shared/types"
import type { ScrollMode } from "./scrollMachine"

export type CachedScrollMode = Exclude<ScrollMode, "anchoring">

// --- Per-chat message cache ---
// Preserves hydrator + messages across chat switches so stale content
// renders instantly while fresh data is fetched (stale-while-revalidate).

export interface CachedChatState {
  hydrator: IncrementalHydrator
  messages: HydratedTranscriptMessage[]
  messageCount: number
  cachedAt: number
  lastMessageAt: number | undefined
  stale: boolean
  scrollTop: number
  scrollMode: CachedScrollMode
}

const chatCache = new Map<string, CachedChatState>()
export const MAX_CACHED_CHATS = 10

export function getCachedChat(chatId: string): CachedChatState | null {
  return chatCache.get(chatId) ?? null
}

export function setCachedChat(chatId: string, state: CachedChatState): void {
  // Delete first so re-insert moves to end (preserves insertion order for LRU)
  chatCache.delete(chatId)
  chatCache.set(chatId, state)

  if (chatCache.size > MAX_CACHED_CHATS) {
    const oldest = chatCache.keys().next().value
    if (oldest !== undefined) chatCache.delete(oldest)
  }
}

export function deleteCachedChat(chatId: string): void {
  chatCache.delete(chatId)
}

export function clearChatCache(): void {
  chatCache.clear()
}

export function markCachedChatsStale(sidebarChats: Array<{ chatId: string; lastMessageAt?: number }>): void {
  const chatMap = new Map(sidebarChats.map((c) => [c.chatId, c]))
  for (const [chatId, cached] of chatCache) {
    if (cached.stale) continue
    const sidebarChat = chatMap.get(chatId)
    if (!sidebarChat || sidebarChat.lastMessageAt === undefined || cached.lastMessageAt === undefined) continue
    if (sidebarChat.lastMessageAt > cached.lastMessageAt) {
      setCachedChat(chatId, { ...cached, stale: true })
    }
  }
}
