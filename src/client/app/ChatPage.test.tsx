import { describe, expect, test } from "bun:test"
import {
  shouldOpenMobileSidebarFromSwipe,
  shouldCloseMobileSidebarFromSwipe,
  shouldIgnoreMobileSidebarSwipeStart,
} from "./ChatPage"

describe("shouldIgnoreMobileSidebarSwipeStart", () => {
  test("returns false for null target", () => {
    expect(shouldIgnoreMobileSidebarSwipeStart(null)).toBe(false)
  })

  test("returns false for non-element target", () => {
    expect(shouldIgnoreMobileSidebarSwipeStart("not an element")).toBe(false)
  })

  test("returns true when target closest matches interactive selector", () => {
    const target = {
      closest: (selector: string) => selector.includes("button") ? {} : null,
    }
    expect(shouldIgnoreMobileSidebarSwipeStart(target)).toBe(true)
  })

  test("returns false when target closest returns null for all selectors", () => {
    const target = {
      closest: () => null,
    }
    expect(shouldIgnoreMobileSidebarSwipeStart(target)).toBe(false)
  })
})

describe("shouldOpenMobileSidebarFromSwipe", () => {
  const base = {
    startX: 10,
    startY: 200,
    currentX: 120,
    currentY: 200,
    isMobileViewport: true,
    isSidebarOpen: false,
    target: null,
  }

  test("returns true for valid right swipe from left edge", () => {
    expect(shouldOpenMobileSidebarFromSwipe(base)).toBe(true)
  })

  test("returns false when not mobile viewport", () => {
    expect(shouldOpenMobileSidebarFromSwipe({ ...base, isMobileViewport: false })).toBe(false)
  })

  test("returns false when sidebar is already open", () => {
    expect(shouldOpenMobileSidebarFromSwipe({ ...base, isSidebarOpen: true })).toBe(false)
  })

  test("returns false when swipe starts too far from left edge", () => {
    expect(shouldOpenMobileSidebarFromSwipe({ ...base, startX: 100 })).toBe(false)
  })

  test("returns false when horizontal distance is too short", () => {
    expect(shouldOpenMobileSidebarFromSwipe({ ...base, currentX: 40 })).toBe(false)
  })

  test("returns false when vertical drift is too large", () => {
    expect(shouldOpenMobileSidebarFromSwipe({ ...base, currentY: 300 })).toBe(false)
  })

  test("returns false when vertical movement exceeds horizontal", () => {
    expect(shouldOpenMobileSidebarFromSwipe({
      ...base,
      startY: 100,
      currentX: 90,
      currentY: 200,
    })).toBe(false)
  })
})

describe("shouldCloseMobileSidebarFromSwipe", () => {
  const base = {
    startX: 200,
    startY: 200,
    currentX: 80,
    currentY: 200,
    isMobileViewport: true,
    isSidebarOpen: true,
    target: null,
  }

  test("returns true for valid left swipe when sidebar is open", () => {
    expect(shouldCloseMobileSidebarFromSwipe(base)).toBe(true)
  })

  test("returns false when not mobile viewport", () => {
    expect(shouldCloseMobileSidebarFromSwipe({ ...base, isMobileViewport: false })).toBe(false)
  })

  test("returns false when sidebar is not open", () => {
    expect(shouldCloseMobileSidebarFromSwipe({ ...base, isSidebarOpen: false })).toBe(false)
  })

  test("returns false when horizontal distance is too short", () => {
    expect(shouldCloseMobileSidebarFromSwipe({ ...base, currentX: 180 })).toBe(false)
  })

  test("returns false when vertical drift is too large", () => {
    expect(shouldCloseMobileSidebarFromSwipe({ ...base, currentY: 300 })).toBe(false)
  })

  test("returns false when vertical movement exceeds horizontal", () => {
    expect(shouldCloseMobileSidebarFromSwipe({
      ...base,
      startY: 100,
      currentX: 160,
      currentY: 200,
    })).toBe(false)
  })

  test("does not require starting from an edge", () => {
    expect(shouldCloseMobileSidebarFromSwipe({
      ...base,
      startX: 300,
      currentX: 180,
    })).toBe(true)
  })

  test("returns false when target is interactive element", () => {
    const target = {
      closest: (selector: string) => selector.includes("button") ? {} : null,
    }
    expect(shouldCloseMobileSidebarFromSwipe({ ...base, target })).toBe(false)
  })
})
