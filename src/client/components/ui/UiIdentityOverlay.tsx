import { createPortal } from "react-dom"
import { UI_IDENTITY_ATTRIBUTE } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"

export const UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE = "data-ui-identity-overlay-root"
const UI_IDENTITY_OVERLAY_PANEL_MIN_WIDTH_PX = 224
const UI_IDENTITY_OVERLAY_PANEL_ROW_HEIGHT_PX = 34
const UI_IDENTITY_OVERLAY_PANEL_PADDING_PX = 16
const UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX = 12
const UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX = 10

export interface UiIdentityOverlayAnchorRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

interface UiIdentityOverlayProps {
  active: boolean
  anchorRect: UiIdentityOverlayAnchorRect | null
  highlightRect: UiIdentityOverlayAnchorRect | null
  stack: Element[]
  highlightedId: string | null
  copiedId: string | null
  onCopy: (id: string) => void
  onHighlight: (id: string) => void
}

interface UiIdentityOverlayViewport {
  width: number
  height: number
}

export function getOverlayCopyLabel(id: string, copiedId: string | null): string {
  return copiedId === id ? "Copied" : "Copy"
}

function getUiIdentityId(element: Element): string | null {
  return element.getAttribute(UI_IDENTITY_ATTRIBUTE)
}

export function getUiIdentityOverlayPanelPosition(args: {
  anchorRect: UiIdentityOverlayAnchorRect
  rowCount: number
  viewport: UiIdentityOverlayViewport
}): { top: number; left: number } {
  const estimatedHeight =
    (Math.max(1, args.rowCount) * UI_IDENTITY_OVERLAY_PANEL_ROW_HEIGHT_PX) + UI_IDENTITY_OVERLAY_PANEL_PADDING_PX
  const estimatedWidth = UI_IDENTITY_OVERLAY_PANEL_MIN_WIDTH_PX
  const preferredTop = args.anchorRect.bottom + UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX
  const maxTop = Math.max(
    UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX,
    args.viewport.height - estimatedHeight - UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX
  )
  const flippedTop = args.anchorRect.top - estimatedHeight - UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX
  const top = preferredTop <= maxTop
    ? preferredTop
    : Math.max(UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX, flippedTop)

  const preferredLeft = args.anchorRect.left + UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX
  const maxLeft = Math.max(
    UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX,
    args.viewport.width - estimatedWidth - UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX
  )
  const flippedLeft = args.anchorRect.left - estimatedWidth - UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX
  const left = preferredLeft + estimatedWidth <= args.viewport.width - UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX
    ? preferredLeft
    : flippedLeft >= UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX
      ? flippedLeft
      : Math.max(UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX, Math.min(preferredLeft, maxLeft))

  return {
    top,
    left,
  }
}

function renderOverlayContent(props: UiIdentityOverlayProps) {
  const rows = props.stack
    .map((element) => {
      const id = getUiIdentityId(element)
      return id ? { id } : null
    })
    .filter((entry): entry is { id: string } => entry !== null)

  if (!props.active || !props.anchorRect || rows.length === 0) {
    return null
  }

  const viewport = typeof window === "undefined"
    ? { width: 1280, height: 800 }
    : { width: window.innerWidth, height: window.innerHeight }
  const panelPosition = getUiIdentityOverlayPanelPosition({
    anchorRect: props.anchorRect,
    rowCount: rows.length,
    viewport,
  })

  return (
    <div
      {...{ [UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE]: "true" }}
      className="pointer-events-none fixed inset-0 z-[120] select-none"
    >
      {props.highlightRect ? (
        <div
          aria-hidden="true"
          className="absolute rounded-xl border-2 border-sky-500/90 bg-sky-500/10"
          style={{
            top: props.highlightRect.top,
            left: props.highlightRect.left,
            width: props.highlightRect.width,
            height: props.highlightRect.height,
            boxShadow: "0 0 0 1px rgba(255,255,255,0.65)",
          }}
        />
      ) : null}
      <div
        className="pointer-events-auto absolute flex min-w-56 flex-col gap-1 rounded-xl border border-border bg-background/95 p-2 shadow-xl backdrop-blur-sm"
        style={{
          top: panelPosition.top,
          left: panelPosition.left,
        }}
      >
        {rows.map(({ id }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "pointer-events-auto flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs",
              props.highlightedId === id ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            onMouseEnter={() => props.onHighlight(id)}
            onFocus={() => props.onHighlight(id)}
            onClick={() => props.onCopy(id)}
          >
            <span className="font-medium">{id}</span>
            <span className="text-[11px]">{getOverlayCopyLabel(id, props.copiedId)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function UiIdentityOverlay(props: UiIdentityOverlayProps) {
  const content = renderOverlayContent(props)
  if (!content) {
    return null
  }

  if (typeof document === "undefined" || !document.body) {
    return content
  }

  return createPortal(content, document.body)
}
