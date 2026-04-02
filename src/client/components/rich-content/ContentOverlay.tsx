import { useCallback, useState, type ReactNode } from "react"
import { Code, FileText, GitCompareArrows, Image, Copy, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DIALOG_BODY_INSET_CLASS_NAME,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import type { RichContentType } from "./types"

const typeIcons: Record<RichContentType, typeof Code> = {
  code: Code,
  markdown: FileText,
  embed: Image,
  diff: GitCompareArrows,
}

const CONTENT_OVERLAY_INNER_CLASS_NAME = `${DIALOG_BODY_INSET_CLASS_NAME} pt-4`
const CONTENT_OVERLAY_ROOT_UI_ID = "rich-content.viewer.area"

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

export function ContentOverlay({
  open,
  onOpenChange,
  title,
  type,
  children,
  rawContent,
}: ContentOverlayProps) {
  const [copied, setCopied] = useState(false)
  const Icon = typeIcons[type]

  const handleCopy = useCallback(async () => {
    if (!rawContent) return
    await navigator.clipboard.writeText(rawContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [rawContent])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" {...getContentOverlayUiIdentityProps()}>
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="truncate text-sm">
              {title ?? type}
            </DialogTitle>
            {rawContent ? (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "ml-auto h-7 w-7 shrink-0 text-muted-foreground",
                  !copied && "hover:text-foreground",
                  copied && "hover:!bg-transparent"
                )}
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody className="p-0">
          <div className={CONTENT_OVERLAY_INNER_CLASS_NAME}>
            {children}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export { CONTENT_OVERLAY_INNER_CLASS_NAME, CONTENT_OVERLAY_ROOT_UI_ID, getContentOverlayUiIdentityProps }
