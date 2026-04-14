import { Building2, Bot, Code, Puzzle } from "lucide-react"
import { cn } from "../lib/utils"
import { useExtensionPreferencesSubscription } from "./useExtensionPreferencesSubscription"
import { clientExtensions } from "../extensions.config"
import type { AppState } from "./useAppState"
import type { LucideIcon } from "lucide-react"

const ICON_MAP: Record<string, LucideIcon> = {
  "building-2": Building2,
  bot: Bot,
  code: Code,
}

function ExtensionCard({
  name,
  icon,
  detectPatterns,
  enabled,
  onToggle,
}: {
  name: string
  icon: string
  detectPatterns: string[]
  enabled: boolean
  onToggle: () => void
}) {
  const Icon = ICON_MAP[icon] ?? Puzzle
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-md bg-accent/50 flex items-center justify-center shrink-0">
            <Icon className="size-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <span className="font-medium text-sm text-foreground">{name}</span>
            {detectPatterns.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {detectPatterns.map((pattern) => (
                  <span
                    key={pattern}
                    className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {pattern}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            enabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
              enabled ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
      </div>
    </div>
  )
}

export function ExtensionsTab({ state }: { state: AppState }) {
  const prefsSnapshot = useExtensionPreferencesSubscription(state.socket)

  function handleToggle(extensionId: string, currentEnabled: boolean) {
    void state.socket.command({
      type: "extension.preference.set",
      extensionId,
      enabled: !currentEnabled,
    })
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Enable or disable extensions for project detection and tools.
      </p>

      {clientExtensions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg">
          <Puzzle className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No extensions available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clientExtensions.map((ext) => {
            const pref = prefsSnapshot?.preferences.find((p) => p.extensionId === ext.id)
            const isEnabled = pref?.enabled !== false
            return (
              <ExtensionCard
                key={ext.id}
                name={ext.name}
                icon={ext.icon}
                detectPatterns={ext.detectPatterns}
                enabled={isEnabled}
                onToggle={() => handleToggle(ext.id, isEnabled)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
