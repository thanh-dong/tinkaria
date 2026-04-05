import { describe, expect, test } from "bun:test"
import {
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  getContentOverlayUiIdentityProps,
  MOBILE_DIALOG_CLASSES,
  DESKTOP_DIALOG_SIZE,
} from "./ContentOverlay"
import { DIALOG_BODY_INSET_CLASS_NAME } from "../ui/dialog"
import { createInitialState } from "./ContentViewerContext"

describe("ContentOverlay", () => {
  test("reuses the dialog body inset baseline for fullscreen content", () => {
    expect(CONTENT_OVERLAY_INNER_CLASS_NAME).toContain("px-4 pb-4")
    expect(CONTENT_OVERLAY_INNER_CLASS_NAME).toContain("pt-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("px-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("pb-4")
    expect(DIALOG_BODY_INSET_CLASS_NAME).toContain("pt-3.5")
  })

  test("tags the fullscreen rich-content viewer root so the overlay can grab it", () => {
    expect(CONTENT_OVERLAY_ROOT_UI_ID).toBe("rich-content.viewer.area")
    expect(getContentOverlayUiIdentityProps()).toEqual({
      "data-ui-id": "rich-content.viewer.area",
    })
  })

  test("mobile dialog classes include fullscreen inset and slide-up animation", () => {
    expect(MOBILE_DIALOG_CLASSES).toContain("inset-0")
    expect(MOBILE_DIALOG_CLASSES).toContain("max-w-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("rounded-none")
    expect(MOBILE_DIALOG_CLASSES).toContain("slide-in-from-bottom")
  })

  test("desktop dialog size is xl", () => {
    expect(DESKTOP_DIALOG_SIZE).toBe("xl")
  })

  test("createInitialState produces correct state for each content type", () => {
    expect(createInitialState("code").type).toBe("code")
    expect(createInitialState("diff").type).toBe("diff")
    expect(createInitialState("embed").type).toBe("embed")
    expect(createInitialState("markdown").type).toBe("markdown")
  })
})
