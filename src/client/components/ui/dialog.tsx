import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"
import { FOCUS_FALLBACK_IGNORE_ATTRIBUTE, RESTORE_CHAT_INPUT_FOCUS_EVENT } from "../../app/chatFocusPolicy"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close
const DialogPortal = DialogPrimitive.Portal

const DIALOG_BODY_INSET_CLASS_NAME = "px-4 pb-4 pt-3.5"
const DIALOG_BODY_CLASS_NAME = `flex-1 min-h-0 overflow-y-auto ${DIALOG_BODY_INSET_CLASS_NAME}`
const RESPONSIVE_MODAL_CONTENT_CLASS_NAME = "max-md:inset-0 max-md:left-0 max-md:top-0 max-md:max-w-none max-md:max-h-none max-md:h-[100dvh] max-md:rounded-none max-md:border-0 max-md:translate-x-0 max-md:translate-y-0 max-md:shadow-none"
const RESPONSIVE_MODAL_HEADER_CLASS_NAME = "max-md:pt-[max(1rem,env(safe-area-inset-top))]"
const RESPONSIVE_MODAL_FOOTER_CLASS_NAME = "max-md:rounded-none max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]"

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-4xl",
  fullscreen: "inset-0 max-w-none max-h-none rounded-none border-0 translate-x-0 translate-y-0 left-0 top-0 shadow-none",
}

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: "sm" | "md" | "lg" | "xl" | "fullscreen"
  }
>(({ className, children, size = "md", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      {...{ [FOCUS_FALLBACK_IGNORE_ATTRIBUTE]: "" }}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        window.dispatchEvent(new Event(RESTORE_CHAT_INPUT_FOCUS_EVENT))
        props.onCloseAutoFocus?.(event)
      }}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        "max-h-[85vh] flex flex-col",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className={cn(
        "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
        size === "fullscreen" && "hidden",
      )}>
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 flex flex-col space-y-1.5 p-4 border-b border-border", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-medium leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(DIALOG_BODY_CLASS_NAME, className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "shrink-0 flex justify-end gap-2 border-t border-border bg-background p-2 rounded-b-xl",
        className,
      )}
      {...props}
    />
  )
}

function DialogPrimaryButton({ className, ...props }: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={cn(
        "touch-manipulation inline-flex items-center justify-center whitespace-nowrap cursor-pointer text-sm font-medium transition-colors",
        "rounded-full h-9 px-4",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        "disabled:pointer-events-none disabled:bg-primary/20 disabled:text-primary/60",
        className,
      )}
      {...props}
    />
  )
}

function DialogGhostButton({ className, ...props }: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      className={cn(
        "touch-manipulation inline-flex items-center justify-center whitespace-nowrap cursor-pointer text-sm font-medium transition-colors",
        "rounded-full h-9 px-4",
        "hover:bg-accent dark:hover:bg-card hover:text-accent-foreground text-muted-foreground",
        "disabled:pointer-events-none disabled:text-muted-foreground/50",
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DIALOG_BODY_INSET_CLASS_NAME,
  DIALOG_BODY_CLASS_NAME,
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_HEADER_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
  DialogBody,
  DialogFooter,
  DialogPrimaryButton,
  DialogGhostButton,
}
