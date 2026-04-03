import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AgentProvider, ModelOptions } from "../../shared/types"

const QUEUED_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_QUEUED_DRAFT_TEXT_LENGTH = 20_000

export interface PersistedQueuedDraft {
  text: string
  updatedAt: number
  options?: {
    provider?: AgentProvider
    model?: string
    modelOptions?: ModelOptions
    planMode?: boolean
  }
}

export function sanitizeQueuedDrafts(
  queuedDrafts: Record<string, PersistedQueuedDraft> | undefined,
  now = Date.now()
): Record<string, PersistedQueuedDraft> {
  if (!queuedDrafts) return {}

  return Object.fromEntries(
    Object.entries(queuedDrafts).flatMap(([chatId, draft]) => {
      if (!draft || typeof draft.text !== "string" || typeof draft.updatedAt !== "number") {
        return []
      }

      const trimmed = draft.text.trim()
      if (!trimmed) return []
      if (now - draft.updatedAt > QUEUED_DRAFT_TTL_MS) return []

      return [[chatId, {
        ...draft,
        text: trimmed.length > MAX_QUEUED_DRAFT_TEXT_LENGTH
          ? trimmed.slice(-MAX_QUEUED_DRAFT_TEXT_LENGTH)
          : trimmed,
      } satisfies PersistedQueuedDraft]]
    })
  )
}

interface ChatInputState {
  drafts: Record<string, string>
  queuedDrafts: Record<string, PersistedQueuedDraft>
  setDraft: (chatId: string, value: string) => void
  clearDraft: (chatId: string) => void
  getDraft: (chatId: string) => string
  setQueuedDraft: (chatId: string, draft: PersistedQueuedDraft) => void
  clearQueuedDraft: (chatId: string) => void
  getQueuedDraft: (chatId: string) => PersistedQueuedDraft | null
  syncQueuedDrafts: (queuedDrafts: Record<string, PersistedQueuedDraft>) => void
  reconcileQueuedDrafts: (validChatIds: string[]) => void
}

export const useChatInputStore = create<ChatInputState>()(
  persist(
    (set, get) => ({
      drafts: {},
      queuedDrafts: {},

      setDraft: (chatId, value) =>
        set((state) => {
          if (!value) {
            const { [chatId]: _, ...rest } = state.drafts
            return { drafts: rest }
          }
          return { drafts: { ...state.drafts, [chatId]: value } }
        }),

      clearDraft: (chatId) =>
        set((state) => {
          const { [chatId]: _, ...rest } = state.drafts
          return { drafts: rest }
        }),

      getDraft: (chatId) => get().drafts[chatId] ?? "",

      setQueuedDraft: (chatId, draft) =>
        set((state) => ({
          queuedDrafts: sanitizeQueuedDrafts({
            ...state.queuedDrafts,
            [chatId]: draft,
          }),
        })),

      clearQueuedDraft: (chatId) =>
        set((state) => {
          const { [chatId]: _, ...rest } = state.queuedDrafts
          return { queuedDrafts: rest }
        }),

      getQueuedDraft: (chatId) => get().queuedDrafts[chatId] ?? null,

      syncQueuedDrafts: (queuedDrafts) =>
        set(() => ({
          queuedDrafts: sanitizeQueuedDrafts(queuedDrafts),
        })),

      reconcileQueuedDrafts: (validChatIds) =>
        set((state) => ({
          queuedDrafts: Object.fromEntries(
            Object.entries(state.queuedDrafts).filter(([chatId]) => validChatIds.includes(chatId))
          ),
        })),
    }),
    {
      name: "chat-input-drafts",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<ChatInputState>
        return {
          ...currentState,
          ...persisted,
          queuedDrafts: sanitizeQueuedDrafts(persisted.queuedDrafts),
        }
      },
    }
  )
)
