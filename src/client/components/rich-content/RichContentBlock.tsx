import { memo, useState, type ReactNode } from "react"
import {
  Code,
  FileText,
  GitCompareArrows,
  Image,
  ChevronRight,
  Maximize2,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { ContentOverlay } from "./ContentOverlay"
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
}

export const RichContentBlock = memo(function RichContentBlock({
  type,
  title,
  defaultExpanded = false,
  children,
  rawContent,
}: RichContentBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const Icon = typeIcons[type]
  const displayTitle = title ?? type

  return (
    <div className="group/rich-content rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 border-b border-border text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-muted-foreground">
          {displayTitle}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label={expanded ? "Collapse content" : "Expand content"}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                expanded && "rotate-90"
              )}
            />
          </button>
          <button
            type="button"
            aria-label="Open in overlay"
            onClick={() => setOverlayOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative transition-[max-height] duration-200 ease-in-out",
          !expanded && `${COLLAPSED_MAX_HEIGHT} overflow-hidden`
        )}
      >
        <div className={CONTENT_BLOCK_BODY_CLASS_NAME}>
          {children}
        </div>
        {!expanded && (
          <div
            className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

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
  )
})

export { CONTENT_BLOCK_BODY_CLASS_NAME }
