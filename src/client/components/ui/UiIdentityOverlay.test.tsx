import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { UI_IDENTITY_ATTRIBUTE } from "../../lib/uiIdentityOverlay"
import { getContextMenuContentUiIdentityProps } from "./context-menu"
import { getDropdownMenuContentUiIdentityProps } from "./dropdown-menu"
import {
  UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE,
  UiIdentityOverlay,
  getUiIdentityOverlayRows,
  getUiIdentityOverlayPanelPosition,
  getOverlayCopyLabel,
} from "./UiIdentityOverlay"

function createStackElement(id: string): Element {
  return {
    getAttribute(name: string) {
      return name === UI_IDENTITY_ATTRIBUTE ? id : null
    },
  } as Element
}

describe("UiIdentityOverlay", () => {
  test("renders rows for the active identity stack during static rendering", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityOverlay
        active
        anchorRect={{ top: 20, left: 30, width: 100, height: 40, right: 130, bottom: 60 }}
        highlightRect={null}
        stack={[
          createStackElement("message.assistant.response"),
          createStackElement("transcript.message-list"),
        ]}
        highlightedId="message.assistant.response"
        copiedId={null}
        onCopy={() => {}}
        onHighlight={() => {}}
      />
    )

    expect(markup).toContain("message.assistant.response")
    expect(markup).toContain("transcript.message-list")
    expect(markup).toContain("Copy")
  })

  test("deduplicates repeated identity rows from nested matching surfaces", () => {
    const stack = [
      createStackElement("rich-content.block"),
      createStackElement("rich-content.block"),
      createStackElement("message.assistant.response"),
    ]
    const markup = renderToStaticMarkup(
      <UiIdentityOverlay
        active
        anchorRect={{ top: 20, left: 30, width: 100, height: 40, right: 130, bottom: 60 }}
        highlightRect={null}
        stack={stack}
        highlightedId="rich-content.block"
        copiedId={null}
        onCopy={() => {}}
        onHighlight={() => {}}
      />
    )

    expect(getUiIdentityOverlayRows(stack).map((row) => row.id)).toEqual([
      "rich-content.block",
      "message.assistant.response",
    ])
    expect(markup).toContain("message.assistant.response")
  })

  test("keeps the overlay card pointer-active so moving between rows stays inside the ignored shell", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityOverlay
        active
        anchorRect={{ top: 20, left: 30, width: 100, height: 40, right: 130, bottom: 60 }}
        highlightRect={null}
        stack={[
          createStackElement("message.assistant.response"),
          createStackElement("transcript.message-list"),
        ]}
        highlightedId="message.assistant.response"
        copiedId={null}
        onCopy={() => {}}
        onHighlight={() => {}}
      />
    )

    expect(markup).toContain(`${UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE}="true"`)
    expect(markup).toContain("class=\"pointer-events-auto absolute flex min-w-56")
  })

  test("renders a visible halo for the currently highlighted target bounds", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityOverlay
        active
        anchorRect={{ top: 20, left: 30, width: 100, height: 40, right: 130, bottom: 60 }}
        highlightRect={{ top: 12, left: 24, width: 220, height: 56, right: 244, bottom: 68 }}
        stack={[
          createStackElement("sidebar.chat-row"),
          createStackElement("sidebar.project-group"),
        ]}
        highlightedId="sidebar.project-group"
        copiedId={null}
        onCopy={() => {}}
        onHighlight={() => {}}
      />
    )

    expect(markup).toContain("border-sky-500/90")
    expect(markup).toContain("box-shadow:0 0 0 1px rgba(255,255,255,0.65)")
    expect(markup).toContain("top:12px")
    expect(markup).toContain("left:24px")
    expect(markup).toContain("width:220px")
    expect(markup).toContain("height:56px")
  })
})

describe("getUiIdentityOverlayPanelPosition", () => {
  test("places the panel below the pointer when there is room", () => {
    expect(getUiIdentityOverlayPanelPosition({
      anchorRect: { top: 100, left: 200, right: 200, bottom: 100, width: 0, height: 0 },
      rowCount: 2,
      viewport: { width: 1200, height: 900 },
    })).toEqual({
      top: 110,
      left: 210,
    })
  })

  test("places the panel to the left when the cursor is near the right edge", () => {
    expect(getUiIdentityOverlayPanelPosition({
      anchorRect: { top: 220, left: 1260, right: 1260, bottom: 220, width: 0, height: 0 },
      rowCount: 3,
      viewport: { width: 1280, height: 800 },
    })).toEqual({
      top: 230,
      left: 1026,
    })
  })

  test("flips the panel above the pointer near the bottom edge", () => {
    expect(getUiIdentityOverlayPanelPosition({
      anchorRect: { top: 760, left: 220, right: 220, bottom: 760, width: 0, height: 0 },
      rowCount: 3,
      viewport: { width: 1200, height: 800 },
    })).toEqual({
      top: 632,
      left: 230,
    })
  })

  test("clamps the panel inside the viewport when neither side has room", () => {
    expect(getUiIdentityOverlayPanelPosition({
      anchorRect: { top: 200, left: 100, right: 100, bottom: 200, width: 0, height: 0 },
      rowCount: 2,
      viewport: { width: 300, height: 800 },
    })).toEqual({
      top: 210,
      left: 64,
    })
  })
})

describe("getOverlayCopyLabel", () => {
  test("prefers copied feedback for the copied row", () => {
    expect(getOverlayCopyLabel("chat.page", "chat.page")).toBe("Copied")
    expect(getOverlayCopyLabel("chat.page", null)).toBe("Copy")
  })
})

describe("menu content ui ids", () => {
  test("passes uiId through to dropdown and context menu content surfaces", () => {
    expect(getDropdownMenuContentUiIdentityProps("sidebar.chat-row.menu")).toEqual({
      "data-ui-id": "sidebar.chat-row.menu",
    })
    expect(getContextMenuContentUiIdentityProps("sidebar.project-group.menu")).toEqual({
      "data-ui-id": "sidebar.project-group.menu",
    })
  })
})
