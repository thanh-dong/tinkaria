import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"
import { createMarkdownComponents } from "./shared"

export interface LocalFilePreview {
  path: string
  content: string
  line?: number
  column?: number
}

function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path)
}

function inferCodeLanguage(path: string): string | null {
  const extension = path.split("/").pop()?.split(".").pop()?.toLowerCase() ?? ""
  switch (extension) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "json":
    case "css":
    case "scss":
    case "html":
    case "xml":
    case "sh":
    case "bash":
    case "zsh":
    case "py":
    case "rs":
    case "go":
    case "java":
    case "rb":
    case "php":
    case "yml":
    case "yaml":
    case "sql":
      return extension
    default:
      return null
  }
}

function wrapPreviewCodeFence(path: string, content: string): string {
  const language = inferCodeLanguage(path) ?? ""
  return `\`\`\`${language}\n${content}\n\`\`\``
}

function getDialogTitle(preview: LocalFilePreview): string {
  if (!preview.line) return preview.path
  if (!preview.column) return `${preview.path}:${preview.line}`
  return `${preview.path}:${preview.line}:${preview.column}`
}

interface LocalFilePreviewDialogProps {
  preview: LocalFilePreview | null
  onClose: () => void
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
}

export function LocalFilePreviewContent({
  preview,
  onOpenLocalLink,
}: {
  preview: LocalFilePreview
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
}) {
  if (isMarkdownFile(preview.path)) {
    return (
      <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={createMarkdownComponents({ onOpenLocalLink, renderRichContentBlocks: false })}
        >
          {preview.content}
        </Markdown>
      </div>
    )
  }

  return (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      <Markdown
        remarkPlugins={[remarkGfm, remarkRichContentHint]}
        components={createMarkdownComponents({ onOpenLocalLink, renderRichContentBlocks: false })}
      >
        {wrapPreviewCodeFence(preview.path, preview.content)}
      </Markdown>
    </div>
  )
}

export function LocalFilePreviewDialog({
  preview,
  onClose,
  onOpenLocalLink,
}: LocalFilePreviewDialogProps) {
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">
            {preview ? getDialogTitle(preview) : "File preview"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {preview ? <LocalFilePreviewContent preview={preview} onOpenLocalLink={onOpenLocalLink} /> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
