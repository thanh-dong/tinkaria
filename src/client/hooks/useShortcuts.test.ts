import { describe, test, expect } from "bun:test"
import {
  matchesShortcut,
  isShortcutActive,
  toDefinitions,
  type ShortcutDefinition,
  type ShortcutRegistration,
} from "./useShortcuts"

describe("matchesShortcut", () => {
  const shortcut: ShortcutDefinition = {
    key: "?",
    alt: true,
    label: "Help",
    scope: "global",
  }

  test("matches when altKey and key match", () => {
    expect(matchesShortcut({ altKey: true, key: "?" }, shortcut)).toBe(true)
  })

  test("does not match when altKey is false", () => {
    expect(matchesShortcut({ altKey: false, key: "?" }, shortcut)).toBe(false)
  })

  test("does not match when key differs", () => {
    expect(matchesShortcut({ altKey: true, key: "n" }, shortcut)).toBe(false)
  })

  test("matches arrow keys", () => {
    const arrow: ShortcutDefinition = {
      key: "ArrowLeft",
      alt: true,
      label: "Previous",
      scope: "new-chat",
    }
    expect(matchesShortcut({ altKey: true, key: "ArrowLeft" }, arrow)).toBe(true)
  })
})

describe("isShortcutActive", () => {
  test("global scope is always active", () => {
    const shortcut: ShortcutDefinition = { key: "?", alt: true, label: "Help", scope: "global" }
    expect(isShortcutActive(shortcut, "global")).toBe(true)
    expect(isShortcutActive(shortcut, "new-chat")).toBe(true)
  })

  test("non-global scope only active when matching", () => {
    const shortcut: ShortcutDefinition = { key: "ArrowLeft", alt: true, label: "Prev", scope: "new-chat" }
    expect(isShortcutActive(shortcut, "new-chat")).toBe(true)
    expect(isShortcutActive(shortcut, "global")).toBe(false)
  })
})

describe("toDefinitions", () => {
  test("strips handler from registrations", () => {
    const registrations: ShortcutRegistration[] = [
      { key: "?", alt: true, label: "Help", scope: "global", handler: () => {} },
      { key: "n", alt: true, label: "New", description: "New chat", scope: "global", handler: () => {} },
    ]
    const defs = toDefinitions(registrations)

    expect(defs).toHaveLength(2)
    expect(defs[0]).toEqual({ key: "?", alt: true, label: "Help", scope: "global" })
    expect(defs[1]).toEqual({ key: "n", alt: true, label: "New", description: "New chat", scope: "global" })

    for (const def of defs) {
      expect("handler" in def).toBe(false)
    }
  })
})
