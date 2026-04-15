import { useCallback, useReducer, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, Code, FileText, GitCompareArrows, Image, Copy, Check, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogClose,
  DIALOG_BODY_INSET_CLASS_NAME,
  RESPONSIVE_MODAL_HEADER_CLASS_NAME,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps, type UiIdentityDescriptor } from "../../lib/uiIdentityOverlay"
import { useIsMobile } from "../../hooks/useIsMobile"
import { ContentViewerContext, viewerReducer, createInitialState } from "./ContentViewerContext"
import { IconButton } from "./IconButton"
import { ViewerToolbar } from "./ViewerToolbar"
import { TocPanel } from "./TocPanel"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code, markdown: FileText, embed: Image, diff: GitCompareArrows,
}

const CONTENT_OVERLAY_FRAME_CLASS_NAME = "mx-auto w-full max-w-[96rem]"
const CONTENT_OVERLAY_DIALOG_CLASS_NAME = "h-[100dvh] max-h-none"
const CONTENT_OVERLAY_INNER_CLASS_NAME = `${DIALOG_BODY_INSET_CLASS_NAME} pt-4`
const CONTENT_OVERLAY_HEADER_CLASS_NAME = "space-y-0 px-3 py-2"
const CONTENT_OVERLAY_ROOT_UI_ID = "rich-content.viewer.area"
const CONTENT_OVERLAY_ROOT_UI_DESCRIPTOR = createUiIdentityDescriptor({
  id: CONTENT_OVERLAY_ROOT_UI_ID,
  c3ComponentId: "c3-107",
  c3ComponentLabel: "rich-content",
})
const CONTENT_OVERLAY_DIALOG_SIZE = "fullscreen" as const
const CONTENT_OVERLAY_SHOW_CODE_LINE_NUMBER_CONTROL = false

const MOBILE_DIALOG_CLASSES =
  "h-[100dvh] data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"

interface ContentOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  type: RichContentType
  children: ReactNode
  rawContent?: string
  rootUiId?: string | UiIdentityDescriptor
}

function getContentOverlayUiIdentityProps(rootUiId: string | UiIdentityDescriptor = CONTENT_OVERLAY_ROOT_UI_DESCRIPTOR) {
  return getUiIdentityAttributeProps(rootUiId)
}

export function ContentOverlay({
  open,
  onOpenChange,
  title,
  type,
  children,
  rawContent,
  rootUiId,
}: ContentOverlayProps) {
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

  const controls = (
    <div className="flex items-center gap-0.5" data-controls="true">
      <ViewerToolbar
        state={viewerState}
        dispatch={dispatch}
        showCodeLineNumbers={CONTENT_OVERLAY_SHOW_CODE_LINE_NUMBER_CONTROL}
      />
      {rawContent ? (
        <>
          <div className="mx-0.5 h-3 w-px bg-border" aria-hidden="true" />
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
        </>
      ) : null}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={CONTENT_OVERLAY_DIALOG_SIZE}
        className={cn(CONTENT_OVERLAY_DIALOG_CLASS_NAME, isMobile && MOBILE_DIALOG_CLASSES)}
        {...getContentOverlayUiIdentityProps(rootUiId)}
      >
        <ContentViewerContext.Provider key={type} value={{ state: viewerState, dispatch }}>
          <DialogHeader className={cn(CONTENT_OVERLAY_HEADER_CLASS_NAME, isMobile && RESPONSIVE_MODAL_HEADER_CLASS_NAME)}>
            <div className={cn("flex w-full items-center gap-2", CONTENT_OVERLAY_FRAME_CLASS_NAME)}>
              {isMobile ? (
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close"
                    className="-ml-2 h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </DialogClose>
              ) : (
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <DialogTitle className="truncate text-sm">{title ?? type}</DialogTitle>
              {!isMobile ? (
                <div className="ml-auto flex items-center gap-2">
                  {controls}
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Close"
                      className="h-8 w-8 rounded text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogClose>
                </div>
              ) : null}
            </div>
          </DialogHeader>

          {isMobile && viewerState.type === "markdown" && viewerState.tocOpen ? (
            <TocPanel
              headings={viewerState.headings}
              onSelect={(id) => {
                const el = bodyRef.current?.querySelector(`#${CSS.escape(id)}`)
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            />
          ) : null}

          <DialogBody className="p-0">
            <div
              ref={bodyRef}
              className={cn(CONTENT_OVERLAY_INNER_CLASS_NAME, CONTENT_OVERLAY_FRAME_CLASS_NAME)}
            >
              {children}
            </div>
          </DialogBody>

          {isMobile ? (
            <div className="flex items-center justify-end px-2.5 py-1.5 bg-muted/50 border-t border-border pb-[env(safe-area-inset-bottom)]">
              <div className={CONTENT_OVERLAY_FRAME_CLASS_NAME}>{controls}</div>
            </div>
          ) : null}
        </ContentViewerContext.Provider>
      </DialogContent>
    </Dialog>
  )
}

export {
  CONTENT_OVERLAY_DIALOG_CLASS_NAME,
  CONTENT_OVERLAY_DIALOG_SIZE,
  CONTENT_OVERLAY_FRAME_CLASS_NAME,
  CONTENT_OVERLAY_HEADER_CLASS_NAME,
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  CONTENT_OVERLAY_SHOW_CODE_LINE_NUMBER_CONTROL,
  MOBILE_DIALOG_CLASSES,
  getContentOverlayUiIdentityProps,
}
