import { useEffect, useCallback } from "react"
import { cn } from "../../lib/utils"
import type { ShortcutDefinition } from "../../hooks/useShortcuts"

export type { ShortcutDefinition }

export interface ShortcutHelpOverlayProps {
  open: boolean
  onClose: () => void
  shortcuts: ShortcutDefinition[]
}

const KEY_DISPLAY: Record<string, string> = {
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
}

function displayKey(key: string): string {
  if (KEY_DISPLAY[key]) return KEY_DISPLAY[key]
  if (key.length === 1) return key.toUpperCase()
  return key
}

const kbdClass =
  "rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono font-medium text-foreground shadow-sm"

function ShortcutKeys({ shortcut }: { shortcut: ShortcutDefinition }) {
  return (
    <span className="flex items-center gap-1">
      {shortcut.alt && (
        <>
          <kbd className={kbdClass}>Alt</kbd>
          <span className="text-muted-foreground text-xs">+</span>
        </>
      )}
      <kbd className={kbdClass}>{displayKey(shortcut.key)}</kbd>
    </span>
  )
}

const SCOPE_LABELS: Record<ShortcutDefinition["scope"], string> = {
  global: "Global",
  "new-chat": "New Chat",
}

function groupByScope(shortcuts: ShortcutDefinition[]): Record<string, ShortcutDefinition[]> {
  const groups: Record<string, ShortcutDefinition[]> = {}
  for (const shortcut of shortcuts) {
    const list = groups[shortcut.scope]
    if (list) {
      list.push(shortcut)
    } else {
      groups[shortcut.scope] = [shortcut]
    }
  }
  return groups
}

export function ShortcutHelpOverlay({
  open,
  onClose,
  shortcuts,
}: ShortcutHelpOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const grouped = groupByScope(shortcuts)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-[400px] rounded-lg border border-border bg-card p-6 shadow-lg",
          "animate-in fade-in zoom-in-95 duration-150",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-foreground mb-4">
          Keyboard Shortcuts
        </h2>

        <div className="space-y-4">
          {(["global", "new-chat"] as const).map((scope) => {
            const items = grouped[scope]
            if (!items?.length) return null
            return (
              <div key={scope}>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {SCOPE_LABELS[scope]}
                </h3>
                <div className="space-y-1.5">
                  {items.map((s) => (
                    <div
                      key={`${s.alt}-${s.key}`}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-foreground">{s.label}</span>
                      <ShortcutKeys shortcut={s} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
