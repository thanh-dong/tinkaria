import { memo, useCallback, useMemo, useReducer, useRef, useState, type PointerEvent, type ReactNode } from "react"
import {
  Code,
  FileText,
  GitCompareArrows,
  Image,
  ChevronRight,
  Maximize2,
  Copy,
  Check,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { ContentOverlay } from "./ContentOverlay"
import {
  ContentViewerContext,
  viewerReducer,
  createInitialState,
} from "./ContentViewerContext"
import { useIsMobile } from "../../hooks/useIsMobile"
import { IconButton } from "./IconButton"
import { ViewerToolbar } from "./ViewerToolbar"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code,
  markdown: FileText,
  embed: Image,
  diff: GitCompareArrows,
}

const COLLAPSED_MAX_HEIGHT = "max-h-24"
const CONTENT_BLOCK_BODY_CLASS_NAME = "px-4 pb-4 pt-3.5"

interface RichContentBlockProps {
  type: RichContentType
  title?: string
  defaultExpanded?: boolean
  children: ReactNode
  rawContent?: string
  chrome?: "card" | "inline"
  controlsVisibility?: "always" | "hover-or-touch"
  bodyClassName?: string
}


export const RichContentBlock = memo(function RichContentBlock({
  type,
  title,
  defaultExpanded = false,
  children,
  rawContent,
  chrome = "card",
  controlsVisibility = "always",
  bodyClassName,
}: RichContentBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [viewerState, dispatch] = useReducer(
    viewerReducer,
    type,
    createInitialState
  )
  const isMobile = useIsMobile()
  const Icon = typeIcons[type]
  const displayTitle = title ?? type
  const rootRef = useRef<HTMLDivElement | null>(null)

  const handlePointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (controlsVisibility !== "hover-or-touch" || event.pointerType !== "touch") {
      return
    }
    rootRef.current?.focus()
  }, [controlsVisibility])

  const handleCopy = useCallback(async () => {
    if (!rawContent) return
    try {
      await navigator.clipboard.writeText(rawContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn(
        "[tinkaria] clipboard write failed:",
        err instanceof Error ? err.message : String(err)
      )
    }
  }, [rawContent])

  const controls = (
    <div className="flex items-center gap-0.5" data-controls="true">
      {viewerState.type === "embed" && (
        <>
          <ViewerToolbar state={viewerState} dispatch={dispatch} />
          <div className="mx-0.5 h-3 w-px bg-border" aria-hidden="true" />
        </>
      )}
      {rawContent ? (
        <IconButton
          ariaLabel={copied ? "Copied" : "Copy content"}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </IconButton>
      ) : null}
      <IconButton
        ariaLabel={expanded ? "Collapse content" : "Expand content"}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </IconButton>
      <IconButton
        ariaLabel="Open in overlay"
        onClick={() => setOverlayOpen(true)}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )

  const content = (
    <div
      className={cn(
        "relative transition-[max-height] duration-200 ease-in-out",
        !expanded && `${COLLAPSED_MAX_HEIGHT} overflow-hidden`
      )}
    >
      <div className={cn(CONTENT_BLOCK_BODY_CLASS_NAME, bodyClassName)}>{children}</div>
      {!expanded ? (
        <div
          className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none"
          aria-hidden="true"
        />
      ) : null}
    </div>
  )

  return (
    <ContentViewerContext.Provider value={useMemo(() => ({ state: viewerState, dispatch }), [viewerState, dispatch])}>
      <div
        ref={rootRef}
        className={cn(
          "group/rich-content min-w-0",
          chrome === "card" ? "rounded-lg border border-border overflow-hidden" : "relative w-full"
        )}
        onPointerDownCapture={handlePointerDownCapture}
        tabIndex={controlsVisibility === "hover-or-touch" ? -1 : undefined}
      >
        {chrome === "card" ? (
          <>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 border-b border-border text-xs",
                isMobile && "py-1"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium text-muted-foreground">
                {displayTitle}
              </span>
              {!isMobile ? (
                <div className="ml-auto">{controls}</div>
              ) : null}
            </div>

            {content}

            {isMobile ? (
              <div className="flex items-center justify-end px-2.5 py-1.5 bg-muted/50 border-t border-border">
                {controls}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div
              className={cn(
                "absolute right-0 top-0 z-10",
                controlsVisibility === "hover-or-touch" && "opacity-0 pointer-events-none transition-opacity duration-150 group-hover/rich-content:opacity-100 group-hover/rich-content:pointer-events-auto group-focus-within/rich-content:opacity-100 group-focus-within/rich-content:pointer-events-auto"
              )}
            >
              <div className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/85 px-1 py-0.5 shadow-sm backdrop-blur-sm">
                {controls}
              </div>
            </div>

            {content}
          </>
        )}

        <ContentOverlay
          open={overlayOpen}
          onOpenChange={setOverlayOpen}
          title={displayTitle}
          type={type}
          rawContent={rawContent}
        >
          {children}
        </ContentOverlay>
      </div>
    </ContentViewerContext.Provider>
  )
})

export { CONTENT_BLOCK_BODY_CLASS_NAME }
