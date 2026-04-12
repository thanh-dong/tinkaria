import { describe, expect, test } from "bun:test"
import {
  isTouchDevice,
  findNearestUiIdentityElement,
  shouldInterceptMobileTap,
  FAB_POSITION_STORAGE_KEY,
  getStoredFabPosition,
  storeFabPosition,
  DEFAULT_FAB_POSITION,
  type FabPosition,
} from "./uiIdentityMobile"

describe("isTouchDevice", () => {
  test("returns true when matchMedia reports coarse pointer", () => {
    const matchMedia = (query: string) => ({
      matches: query === "(pointer: coarse)",
    })
    expect(isTouchDevice(matchMedia as typeof window.matchMedia)).toBe(true)
  })

  test("returns false when matchMedia reports fine pointer", () => {
    const matchMedia = (_query: string) => ({
      matches: false,
    })
    expect(isTouchDevice(matchMedia as typeof window.matchMedia)).toBe(false)
  })
})

describe("findNearestUiIdentityElement", () => {
  test("returns the element itself when it has data-ui-id", () => {
    const element = {
      getAttribute: (name: string) => (name === "data-ui-id" ? "chat.page" : null),
      closest: () => element,
    } as unknown as Element
    expect(findNearestUiIdentityElement(element)).toBe(element)
  })

  test("walks up via closest to find the nearest tagged ancestor", () => {
    const ancestor = {
      getAttribute: (name: string) => (name === "data-ui-id" ? "chat.page" : null),
    }
    const element = {
      getAttribute: () => null,
      closest: (selector: string) =>
        selector === "[data-ui-id]" ? ancestor : null,
    } as unknown as Element
    expect(findNearestUiIdentityElement(element)).toBe(ancestor as unknown as Element)
  })

  test("returns null when no tagged element is found", () => {
    const element = {
      getAttribute: () => null,
      closest: () => null,
    } as unknown as Element
    expect(findNearestUiIdentityElement(element)).toBeNull()
  })
})

describe("shouldInterceptMobileTap", () => {
  test("returns false for overlay root descendants", () => {
    const target = {
      closest: (selector: string) =>
        selector === '[data-ui-identity-overlay-root="true"]' ? {} : null,
    } as unknown as Element
    expect(shouldInterceptMobileTap(target)).toBe(false)
  })

  test("returns false for FAB descendants", () => {
    const target = {
      closest: (selector: string) =>
        selector === '[data-ui-identity-fab="true"]' ? {} : null,
    } as unknown as Element
    expect(shouldInterceptMobileTap(target)).toBe(false)
  })

  test("returns true for a tagged surface", () => {
    const target = {
      closest: (selector: string) => {
        if (selector === '[data-ui-identity-overlay-root="true"]') return null
        if (selector === '[data-ui-identity-fab="true"]') return null
        if (selector === "[data-ui-id]") return {}
        return null
      },
    } as unknown as Element
    expect(shouldInterceptMobileTap(target)).toBe(true)
  })

  test("returns false for an untagged element outside the overlay", () => {
    const target = {
      closest: () => null,
    } as unknown as Element
    expect(shouldInterceptMobileTap(target)).toBe(false)
  })
})

describe("FAB position persistence", () => {
  test("DEFAULT_FAB_POSITION is bottom-right", () => {
    expect(DEFAULT_FAB_POSITION).toEqual({ right: 12, bottom: 12 })
  })

  test("storeFabPosition writes JSON to localStorage", () => {
    const stored: Record<string, string> = {}
    const storage = {
      setItem: (key: string, value: string) => { stored[key] = value },
    } as Storage
    const position: FabPosition = { right: 20, bottom: 30 }
    storeFabPosition(position, storage)
    expect(JSON.parse(stored[FAB_POSITION_STORAGE_KEY])).toEqual(position)
  })

  test("getStoredFabPosition reads from localStorage", () => {
    const storage = {
      getItem: (key: string) =>
        key === FAB_POSITION_STORAGE_KEY ? '{"right":20,"bottom":30}' : null,
    } as Storage
    expect(getStoredFabPosition(storage)).toEqual({ right: 20, bottom: 30 })
  })

  test("getStoredFabPosition returns null for missing/corrupt data", () => {
    const emptyStorage = { getItem: () => null } as Storage
    expect(getStoredFabPosition(emptyStorage)).toBeNull()

    const corruptStorage = { getItem: () => "not json" } as Storage
    expect(getStoredFabPosition(corruptStorage)).toBeNull()
  })
})
