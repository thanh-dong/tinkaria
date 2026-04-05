import { createContext, useContext } from "react"
import type { RichContentType } from "./types"

export interface TocHeading {
  level: number
  text: string
  id: string
}

export type CodeViewerState = { type: "code"; lineNumbers: boolean }
export type DiffViewerState = { type: "diff"; viewMode: "unified" | "split" }
export type EmbedViewerState = { type: "embed"; renderMode: "render" | "source"; zoom: number }
export type MarkdownViewerState = { type: "markdown"; tocOpen: boolean; headings: TocHeading[] }

export type ViewerState = CodeViewerState | DiffViewerState | EmbedViewerState | MarkdownViewerState

export type ViewerAction =
  | { type: "TOGGLE_LINE_NUMBERS" }
  | { type: "TOGGLE_VIEW_MODE" }
  | { type: "SET_RENDER_MODE"; payload: "render" | "source" }
  | { type: "ZOOM_IN" }
  | { type: "ZOOM_OUT" }
  | { type: "ZOOM_RESET" }
  | { type: "TOGGLE_TOC" }
  | { type: "REGISTER_HEADINGS"; payload: TocHeading[] }

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.25

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (state.type) {
    case "code":
      if (action.type === "TOGGLE_LINE_NUMBERS") {
        return { ...state, lineNumbers: !state.lineNumbers }
      }
      return state
    case "diff":
      if (action.type === "TOGGLE_VIEW_MODE") {
        return { ...state, viewMode: state.viewMode === "unified" ? "split" : "unified" }
      }
      return state
    case "embed":
      switch (action.type) {
        case "SET_RENDER_MODE": return { ...state, renderMode: action.payload }
        case "ZOOM_IN": return { ...state, zoom: state.zoom + ZOOM_STEP }
        case "ZOOM_OUT": return { ...state, zoom: Math.max(ZOOM_MIN, state.zoom - ZOOM_STEP) }
        case "ZOOM_RESET": return { ...state, zoom: 1 }
        default: return state
      }
    case "markdown":
      switch (action.type) {
        case "TOGGLE_TOC": return { ...state, tocOpen: !state.tocOpen }
        case "REGISTER_HEADINGS": return { ...state, headings: action.payload }
        default: return state
      }
  }
}

export function createInitialState(contentType: RichContentType): ViewerState {
  switch (contentType) {
    case "code": return { type: "code", lineNumbers: false }
    case "diff": return { type: "diff", viewMode: "unified" }
    case "embed": return { type: "embed", renderMode: "render", zoom: 1 }
    case "markdown": return { type: "markdown", tocOpen: false, headings: [] }
  }
}

export interface ContentViewerContextValue {
  state: ViewerState
  dispatch: (action: ViewerAction) => void
}

export const ContentViewerContext = createContext<ContentViewerContextValue | null>(null)

export function useContentViewer(): ContentViewerContextValue | null {
  return useContext(ContentViewerContext)
}
