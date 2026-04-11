import * as React from "react"
import { cn } from "../../lib/utils"

type InputSize = "default" | "sm"
type InputProps = Omit<React.ComponentProps<"input">, "size"> & { size?: InputSize }

const sizeClasses: Record<InputSize, string> = {
  default: "rounded-lg px-3 py-2 bg-background outline-none",
  sm: "rounded-md px-2 py-1 bg-transparent focus:ring-1 focus:ring-ring",
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex w-full border border-border text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          sizeClasses[size],
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
