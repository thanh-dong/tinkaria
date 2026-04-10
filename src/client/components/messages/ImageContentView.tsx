import { memo } from "react"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import type { ImageContentBlock } from "../../../shared/types"

interface ImageContentViewProps {
  images: ImageContentBlock[]
  text?: string
  title?: string
}

export const ImageContentView = memo(function ImageContentView({
  images,
  text,
  title,
}: ImageContentViewProps) {
  return (
    <RichContentBlock type="embed" title={title ?? "Image"} defaultExpanded>
      <div className="space-y-3">
        {images.map((image, index) => (
          <img
            key={index}
            src={`data:${image.mediaType};base64,${image.data}`}
            alt={title ? `Content of ${title}` : `Image ${index + 1}`}
            className="block max-w-full max-h-[50vh] rounded-md border border-border/60 bg-background object-contain"
          />
        ))}
        {text ? (
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
            {text}
          </pre>
        ) : null}
      </div>
    </RichContentBlock>
  )
})
