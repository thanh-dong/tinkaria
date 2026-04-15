import { memo } from "react"
import { Code, Columns2, Eye, Hash, List, Minus, Plus, Rows3 } from "lucide-react"
import { IconButton } from "./IconButton"
import type { ViewerState, ViewerAction } from "./ContentViewerContext"

interface ViewerToolbarProps {
  state: ViewerState
  dispatch: (action: ViewerAction) => void
  showCodeLineNumbers?: boolean
}

export const ViewerToolbar = memo(function ViewerToolbar({ state, dispatch, showCodeLineNumbers = true }: ViewerToolbarProps) {
  switch (state.type) {
    case "code":
      if (!showCodeLineNumbers) return null
      return (
        <IconButton
          ariaLabel="Toggle line numbers"
          active={state.lineNumbers}
          onClick={() => dispatch({ type: "TOGGLE_LINE_NUMBERS" })}
        >
          <Hash className="h-3.5 w-3.5" />
        </IconButton>
      )
    case "diff":
      return (
        <>
          <IconButton
            ariaLabel="Unified view"
            active={state.viewMode === "unified"}
            onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "unified" })}
          >
            <Rows3 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            ariaLabel="Split view"
            active={state.viewMode === "split"}
            onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "split" })}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </IconButton>
        </>
      )
    case "embed":
      return (
        <>
          <IconButton
            ariaLabel="Show rendered"
            active={state.renderMode === "render"}
            onClick={() => dispatch({ type: "SET_RENDER_MODE", payload: "render" })}
          >
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            ariaLabel="Show source"
            active={state.renderMode === "source"}
            onClick={() => dispatch({ type: "SET_RENDER_MODE", payload: "source" })}
          >
            <Code className="h-3.5 w-3.5" />
          </IconButton>
          <div className="mx-0.5 h-3 w-px bg-border" aria-hidden="true" />
          <IconButton
            ariaLabel="Zoom out"
            onClick={() => dispatch({ type: "ZOOM_OUT" })}
          >
            <Minus className="h-3 w-3" />
          </IconButton>
          <button
            type="button"
            aria-label="Reset zoom"
            onClick={() => dispatch({ type: "ZOOM_RESET" })}
            className="flex h-6 min-w-[2.25rem] items-center justify-center rounded px-1 text-[10px] tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {Math.round(state.zoom * 100)}%
          </button>
          <IconButton
            ariaLabel="Zoom in"
            onClick={() => dispatch({ type: "ZOOM_IN" })}
          >
            <Plus className="h-3 w-3" />
          </IconButton>
        </>
      )
    case "markdown":
      return (
        <IconButton
          ariaLabel="Table of contents"
          active={state.tocOpen}
          onClick={() => dispatch({ type: "TOGGLE_TOC" })}
        >
          <List className="h-3.5 w-3.5" />
        </IconButton>
      )
  }
})
