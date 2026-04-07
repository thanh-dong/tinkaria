import { memo } from "react"
import { Hash, Minus, Plus, List } from "lucide-react"
import { cn } from "../../lib/utils"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import type { ViewerState, ViewerAction } from "./ContentViewerContext"

const VIEWER_TOOLBAR_UI_DESCRIPTOR = createUiIdentityDescriptor({
  id: "rich-content.toolbar.area",
  c3ComponentId: "c3-107",
  c3ComponentLabel: "rich-content",
})

interface ViewerToolbarProps {
  state: ViewerState
  dispatch: (action: ViewerAction) => void
}

export const ViewerToolbar = memo(function ViewerToolbar({ state, dispatch }: ViewerToolbarProps) {
  switch (state.type) {
    case "code":
      return (
        <ToolbarRow>
          <ToggleButton label="Ln #" icon={<Hash className="h-3 w-3" />} pressed={state.lineNumbers} onClick={() => dispatch({ type: "TOGGLE_LINE_NUMBERS" })} />
        </ToolbarRow>
      )
    case "diff":
      return (
        <ToolbarRow>
          <SegmentGroup>
            <SegmentButton label="Unified" active={state.viewMode === "unified"} onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "unified" })} />
            <SegmentButton label="Split" active={state.viewMode === "split"} onClick={() => dispatch({ type: "SET_VIEW_MODE", payload: "split" })} />
          </SegmentGroup>
        </ToolbarRow>
      )
    case "embed":
      return (
        <ToolbarRow>
          <SegmentGroup>
            <SegmentButton label="Render" active={state.renderMode === "render"} onClick={() => dispatch({ type: "SET_RENDER_MODE", payload: "render" })} />
            <SegmentButton label="Source" active={state.renderMode === "source"} onClick={() => dispatch({ type: "SET_RENDER_MODE", payload: "source" })} />
          </SegmentGroup>
          <div className="flex items-center gap-1">
            <ZoomButton icon={<Minus className="h-3 w-3" />} label="Zoom out" onClick={() => dispatch({ type: "ZOOM_OUT" })} />
            <button type="button" aria-label="Reset zoom" onClick={() => dispatch({ type: "ZOOM_RESET" })} className="min-w-[3rem] rounded px-1.5 py-1 text-center text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {Math.round(state.zoom * 100)}%
            </button>
            <ZoomButton icon={<Plus className="h-3 w-3" />} label="Zoom in" onClick={() => dispatch({ type: "ZOOM_IN" })} />
          </div>
        </ToolbarRow>
      )
    case "markdown":
      return (
        <ToolbarRow>
          <ToggleButton label="TOC" icon={<List className="h-3 w-3" />} pressed={state.tocOpen} onClick={() => dispatch({ type: "TOGGLE_TOC" })} />
        </ToolbarRow>
      )
  }
})

function ToolbarRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5" {...getUiIdentityAttributeProps(VIEWER_TOOLBAR_UI_DESCRIPTOR)}>{children}</div>
}

function SegmentGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5 text-xs">{children}</div>
}

function SegmentButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("rounded px-2.5 py-1 text-xs transition-colors", active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
  )
}

function ToggleButton({ label, icon, pressed, onClick }: { label: string; icon: React.ReactNode; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors", pressed ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
      {icon}
      {label}
    </button>
  )
}

function ZoomButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      {icon}
    </button>
  )
}
