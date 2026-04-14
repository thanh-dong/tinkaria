import { useEffect, useMemo } from "react"

export type ShortcutScope = "global" | "new-chat"

export interface ShortcutDefinition {
  key: string
  alt: boolean
  shift?: boolean
  label: string
  description?: string
  scope: ShortcutScope
}

export interface ShortcutRegistration extends ShortcutDefinition {
  handler: () => void
}

export function matchesShortcut(
  event: Pick<KeyboardEvent, "altKey" | "key"> & Partial<Pick<KeyboardEvent, "shiftKey">>,
  shortcut: ShortcutDefinition,
): boolean {
  return event.altKey === shortcut.alt
    && Boolean(event.shiftKey) === Boolean(shortcut.shift)
    && event.key === shortcut.key
}

export function isShortcutActive(shortcut: ShortcutDefinition, activeScope: ShortcutScope): boolean {
  return shortcut.scope === "global" || shortcut.scope === activeScope
}

export function toDefinitions(registrations: ShortcutRegistration[]): ShortcutDefinition[] {
  return registrations.map(({ handler: _, ...def }) => def)
}

export function useShortcuts(
  registrations: ShortcutRegistration[],
  activeScope: ShortcutScope,
): ShortcutDefinition[] {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      for (const reg of registrations) {
        if (matchesShortcut(e, reg) && isShortcutActive(reg, activeScope)) {
          e.preventDefault()
          e.stopPropagation()
          reg.handler()
          return
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [registrations, activeScope])

  return useMemo(() => toDefinitions(registrations), [registrations])
}
