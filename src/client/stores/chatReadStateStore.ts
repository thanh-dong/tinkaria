import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ChatReadState {
  lastSeenMessageAtByChat: Record<string, number>
  markChatRead: (chatId: string, lastMessageAt: number) => void
  clearChat: (chatId: string) => void
}

export const useChatReadStateStore = create<ChatReadState>()(
  persist(
    (set) => ({
      lastSeenMessageAtByChat: {},
      markChatRead: (chatId, lastMessageAt) =>
        set((state) => {
          const current = state.lastSeenMessageAtByChat[chatId]
          if (current !== undefined && current >= lastMessageAt) {
            return state
          }

          return {
            lastSeenMessageAtByChat: {
              ...state.lastSeenMessageAtByChat,
              [chatId]: lastMessageAt,
            },
          }
        }),
      clearChat: (chatId) =>
        set((state) => {
          if (!(chatId in state.lastSeenMessageAtByChat)) {
            return state
          }

          const { [chatId]: _removed, ...rest } = state.lastSeenMessageAtByChat
          return { lastSeenMessageAtByChat: rest }
        }),
    }),
    {
      name: "chat-read-state",
      version: 1,
    }
  )
)
