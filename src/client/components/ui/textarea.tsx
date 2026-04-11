import * as React from "react"
import { cn } from "../../lib/utils"

type TextareaSize = "default" | "sm"
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: TextareaSize
}

const sizeClasses: Record<TextareaSize, string> = {
  default: "rounded-lg px-2.5 py-2 bg-background",
  sm: "rounded-md px-2 py-1 bg-transparent focus:ring-1 focus:ring-ring resize-none",
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size = "default", ...props }, ref) => {
    return (
      <textarea
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-1p-ignore
        autoComplete="off"
        className={cn(
          "flex w-full border border-border text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
