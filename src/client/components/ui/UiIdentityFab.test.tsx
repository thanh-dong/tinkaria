import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  UiIdentityFab,
  UI_IDENTITY_FAB_SIZE_PX,
  getFabStyle,
} from "./UiIdentityFab"
import { UI_IDENTITY_FAB_ATTRIBUTE } from "../../lib/uiIdentityMobile"

describe("UI_IDENTITY_FAB_SIZE_PX", () => {
  test("is 36px per spec", () => {
    expect(UI_IDENTITY_FAB_SIZE_PX).toBe(36)
  })
})

describe("getFabStyle", () => {
  test("positions the FAB using right/bottom from the position object", () => {
    const style = getFabStyle({ right: 20, bottom: 30 })
    expect(style).toEqual({
      position: "fixed",
      right: 20,
      bottom: 30,
      width: 36,
      height: 36,
      zIndex: 119,
    })
  })
})

describe("UiIdentityFab", () => {
  test("renders the FAB with the correct data attribute for interception exclusion", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityFab active={false} onToggle={() => {}} />
    )
    expect(markup).toContain(`${UI_IDENTITY_FAB_ATTRIBUTE}="true"`)
  })

  test("renders idle styling when inactive", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityFab active={false} onToggle={() => {}} />
    )
    expect(markup).toContain("opacity:0.4")
  })

  test("renders active styling when active", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityFab active={true} onToggle={() => {}} />
    )
    expect(markup).toContain("opacity:1")
  })

  test("renders a button element for accessibility", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityFab active={false} onToggle={() => {}} />
    )
    expect(markup).toContain("<button")
    expect(markup).toContain('type="button"')
  })
})
