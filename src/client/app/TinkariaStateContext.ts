import { createContext, useContext } from "react"
import type { TinkariaState } from "./useTinkariaState"

export const TinkariaStateContext = createContext<TinkariaState | null>(null)

export function useTinkariaAppState(): TinkariaState {
  const state = useContext(TinkariaStateContext)
  if (!state) {
    throw new Error("Tinkaria app state is unavailable outside the app provider")
  }
  return state
}
