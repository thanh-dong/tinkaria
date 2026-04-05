import { describe, test, expect } from "bun:test"
import { MOBILE_BREAKPOINT_QUERY, getIsMobile } from "./useIsMobile"

describe("useIsMobile", () => {
  test("exports the correct media query string", () => {
    expect(MOBILE_BREAKPOINT_QUERY).toBe("(max-width: 767px)")
  })

  test("getIsMobile returns false when matchMedia is unavailable", () => {
    const saved = globalThis.window
    // @ts-expect-error — deliberately removing window for SSR test
    globalThis.window = undefined
    expect(getIsMobile()).toBe(false)
    globalThis.window = saved
  })
})
