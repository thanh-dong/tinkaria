import { useCallback, useReducer, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, Code, FileText, GitCompareArrows, Image, Copy, Check } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogClose, DIALOG_BODY_INSET_CLASS_NAME,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { useIsMobile } from "../../hooks/useIsMobile"
import { ContentViewerContext, viewerReducer, createInitialState } from "./ContentViewerContext"
import { ViewerToolbar } from "./ViewerToolbar"
import { TocPanel } from "./TocPanel"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code, markdown: FileText, embed: Image, diff: GitCompareArrows,
}

const CONTENT_OVERLAY_INNER_CLASS_NAME = `${DIALOG_BODY_INSET_CLASS_NAME} pt-4`
const CONTENT_OVERLAY_ROOT_UI_ID = "rich-content.viewer.area"
const DESKTOP_DIALOG_SIZE = "xl" as const

const MOBILE_DIALOG_CLASSES =
  "h-[100dvh] data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"

interface ContentOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  type: RichContentType
  children: ReactNode
  rawContent?: string
}

function getContentOverlayUiIdentityProps() {
  return getUiIdentityAttributeProps(CONTENT_OVERLAY_ROOT_UI_ID)
}

export function ContentOverlay({ open, onOpenChange, title, type, children, rawContent }: ContentOverlayProps) {
  const [copied, setCopied] = useState(false)
  const isMobile = useIsMobile()
  const [viewerState, dispatch] = useReducer(viewerReducer, type, createInitialState)
  const bodyRef = useRef<HTMLDivElement>(null)
  const Icon = typeIcons[type]

  const handleCopy = useCallback(async () => {
    if (!rawContent) return
    try {
      await navigator.clipboard.writeText(rawContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn("[tinkaria] clipboard write failed:", err instanceof Error ? err.message : String(err))
    }
  }, [rawContent])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={isMobile ? "fullscreen" : DESKTOP_DIALOG_SIZE}
        className={cn(isMobile && MOBILE_DIALOG_CLASSES)}
        {...getContentOverlayUiIdentityProps()}
      >
        <ContentViewerContext.Provider key={type} value={{ state: viewerState, dispatch }}>
          <DialogHeader className={cn(isMobile && "pt-[env(safe-area-inset-top)]")}>
            <div className="flex items-center gap-2 pr-8">
              {isMobile ? (
                <DialogClose asChild>
                  <button type="button" aria-label="Close" className="flex h-11 w-11 -ml-2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                </DialogClose>
              ) : (
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <DialogTitle className="truncate text-sm">{title ?? type}</DialogTitle>
              {rawContent ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "ml-auto shrink-0 text-muted-foreground",
                    isMobile ? "h-11 w-11" : "h-7 w-7",
                    !copied && "hover:text-foreground",
                    copied && "hover:!bg-transparent"
                  )}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className={cn(isMobile ? "h-5 w-5" : "h-3.5 w-3.5", "text-green-400")} />
                  ) : (
                    <Copy className={cn(isMobile ? "h-5 w-5" : "h-3.5 w-3.5")} />
                  )}
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          {isMobile ? <ViewerToolbar state={viewerState} dispatch={dispatch} /> : null}

          {isMobile && viewerState.type === "markdown" && viewerState.tocOpen ? (
            <TocPanel
              headings={viewerState.headings}
              onSelect={(id) => {
                const el = bodyRef.current?.querySelector(`#${CSS.escape(id)}`)
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            />
          ) : null}

          <DialogBody className={cn("p-0", isMobile && "pb-[env(safe-area-inset-bottom)]")}>
            <div ref={bodyRef} className={CONTENT_OVERLAY_INNER_CLASS_NAME}>{children}</div>
          </DialogBody>
        </ContentViewerContext.Provider>
      </DialogContent>
    </Dialog>
  )
}

export {
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  MOBILE_DIALOG_CLASSES,
  DESKTOP_DIALOG_SIZE,
  getContentOverlayUiIdentityProps,
}
