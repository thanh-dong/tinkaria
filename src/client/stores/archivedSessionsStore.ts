import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ArchivedSessionsState {
  archivedIds: string[]
  archive: (chatId: string) => void
  unarchive: (chatId: string) => void
}

export const useArchivedSessionsStore = create<ArchivedSessionsState>()(
  persist(
    (set) => ({
      archivedIds: [],
      archive: (chatId) =>
        set((state) => ({
          archivedIds: state.archivedIds.includes(chatId)
            ? state.archivedIds
            : [...state.archivedIds, chatId],
        })),
      unarchive: (chatId) =>
        set((state) => ({
          archivedIds: state.archivedIds.filter((id) => id !== chatId),
        })),
    }),
    { name: "archived-sessions", version: 1 },
  ),
)

export function isArchivedChat(archivedIds: string[], chatId: string): boolean {
  return archivedIds.includes(chatId)
}
