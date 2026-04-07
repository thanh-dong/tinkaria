import { describe, expect, test } from "bun:test"
import {
  RESPONSIVE_MODAL_CONTENT_CLASS_NAME,
  RESPONSIVE_MODAL_FOOTER_CLASS_NAME,
  RESPONSIVE_MODAL_HEADER_CLASS_NAME,
} from "./dialog"

describe("responsive modal dialog tokens", () => {
  test("fullscreen mobile content class keeps desktop dialogs centered but expands on mobile", () => {
    expect(RESPONSIVE_MODAL_CONTENT_CLASS_NAME).toContain("max-md:inset-0")
    expect(RESPONSIVE_MODAL_CONTENT_CLASS_NAME).toContain("max-md:h-[100dvh]")
    expect(RESPONSIVE_MODAL_CONTENT_CLASS_NAME).toContain("max-md:rounded-none")
  })

  test("header and footer classes preserve safe-area spacing on mobile", () => {
    expect(RESPONSIVE_MODAL_HEADER_CLASS_NAME).toContain("safe-area-inset-top")
    expect(RESPONSIVE_MODAL_FOOTER_CLASS_NAME).toContain("safe-area-inset-bottom")
    expect(RESPONSIVE_MODAL_FOOTER_CLASS_NAME).toContain("max-md:rounded-none")
  })
})
