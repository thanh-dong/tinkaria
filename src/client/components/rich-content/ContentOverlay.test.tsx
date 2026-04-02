import { describe, expect, test } from "bun:test"
import {
  CONTENT_OVERLAY_INNER_CLASS_NAME,
  CONTENT_OVERLAY_ROOT_UI_ID,
  getContentOverlayUiIdentityProps,
} from "./ContentOverlay"
import { DIALOG_BODY_INSET_CLASS_NAME } from "../ui/dialog"

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
})
