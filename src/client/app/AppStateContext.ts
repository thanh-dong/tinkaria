import { createContext, useContext } from "react"
import type { AppState } from "./useAppState"

export const AppStateContext = createContext<AppState | null>(null)

export function useAppContext(): AppState {
  const state = useContext(AppStateContext)
  if (!state) {
    throw new Error("App state is unavailable outside the app provider")
  }
  return state
}
