import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ChatReadState {
  lastReadBlockIndexByChat: Record<string, number>
  lastReadMessageIdByChat: Record<string, string>
  lastSeenMessageAtByChat: Record<string, number>
  markChatRead: (chatId: string, boundary: { messageId?: string; blockIndex?: number; lastMessageAt?: number }) => void
  clearChat: (chatId: string) => void
}

export const useChatReadStateStore = create<ChatReadState>()(
  persist(
    (set) => ({
      lastReadBlockIndexByChat: {},
      lastReadMessageIdByChat: {},
      lastSeenMessageAtByChat: {},
      markChatRead: (chatId, boundary) =>
        set((state) => {
          const nextMessageId = boundary.messageId?.trim()
          const nextBlockIndex = boundary.blockIndex
          const nextLastSeen = boundary.lastMessageAt

          const currentBlockIndex = state.lastReadBlockIndexByChat[chatId]
          const currentMessageId = state.lastReadMessageIdByChat[chatId]
          const currentLastSeen = state.lastSeenMessageAtByChat[chatId]
          const shouldKeepMessageId = !nextMessageId || currentMessageId === nextMessageId
          const shouldKeepBlockIndex = nextBlockIndex === undefined || currentBlockIndex === nextBlockIndex
          const shouldKeepLastSeen = nextLastSeen === undefined || (currentLastSeen !== undefined && currentLastSeen >= nextLastSeen)

          if (shouldKeepMessageId && shouldKeepBlockIndex && shouldKeepLastSeen) {
            return state
          }

          return {
            lastReadBlockIndexByChat: nextBlockIndex === undefined
              ? state.lastReadBlockIndexByChat
              : {
                  ...state.lastReadBlockIndexByChat,
                  [chatId]: nextBlockIndex,
                },
            lastReadMessageIdByChat: nextMessageId
              ? {
                  ...state.lastReadMessageIdByChat,
                  [chatId]: nextMessageId,
                }
              : state.lastReadMessageIdByChat,
            lastSeenMessageAtByChat: {
              ...state.lastSeenMessageAtByChat,
              ...(nextLastSeen === undefined ? {} : { [chatId]: nextLastSeen }),
            },
          }
        }),
      clearChat: (chatId) =>
        set((state) => {
          if (
            !(chatId in state.lastSeenMessageAtByChat)
            && !(chatId in state.lastReadMessageIdByChat)
            && !(chatId in state.lastReadBlockIndexByChat)
          ) {
            return state
          }

          const { [chatId]: _removedBlock, ...restBlock } = state.lastReadBlockIndexByChat
          const { [chatId]: _removedSeen, ...restSeen } = state.lastSeenMessageAtByChat
          const { [chatId]: _removedRead, ...restRead } = state.lastReadMessageIdByChat
          return {
            lastReadBlockIndexByChat: restBlock,
            lastSeenMessageAtByChat: restSeen,
            lastReadMessageIdByChat: restRead,
          }
        }),
    }),
    {
      name: "chat-read-state",
      version: 3,
      migrate: (persistedState, version) => {
        if (version === 1) {
          const state = persistedState as Partial<ChatReadState>
          return {
            lastReadBlockIndexByChat: {},
            lastReadMessageIdByChat: {},
            lastSeenMessageAtByChat: state.lastSeenMessageAtByChat ?? {},
          }
        }

        if (version === 2) {
          const state = persistedState as Partial<ChatReadState>
          return {
            lastReadBlockIndexByChat: {},
            lastReadMessageIdByChat: state.lastReadMessageIdByChat ?? {},
            lastSeenMessageAtByChat: state.lastSeenMessageAtByChat ?? {},
          }
        }

        return persistedState as ChatReadState
      },
    }
  )
)
