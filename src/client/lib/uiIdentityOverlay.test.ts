import { describe, expect, test } from "bun:test"
import {
  buildUiIdentityStack,
  createUiIdentity,
  createUiIdentityDescriptor,
  formatCopiedUiIdentity,
  getUiIdentityAttributeProps,
  isUiIdentityOverlayActive,
  type UiIdentityDescriptor,
  type UiIdentityKind,
} from "./uiIdentityOverlay"

type FakeUiIdentityElement = {
  parentElement: FakeUiIdentityElement | null
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
}

function createElement(taggedId: string | null = null, parent: FakeUiIdentityElement | null = null): FakeUiIdentityElement {
  const attributes = new Map<string, string>()
  const element: FakeUiIdentityElement = {
    parentElement: parent,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      attributes.set(name, value)
    },
  }

  if (taggedId) {
    element.setAttribute("data-ui-id", taggedId)
  }

  return element
}

describe("isUiIdentityOverlayActive", () => {
  test("activates only when Alt and Shift are both pressed", () => {
    expect(isUiIdentityOverlayActive({ altKey: true, shiftKey: true })).toBe(true)
    expect(isUiIdentityOverlayActive({ altKey: true, shiftKey: false })).toBe(false)
    expect(isUiIdentityOverlayActive({ altKey: false, shiftKey: true })).toBe(false)
    expect(isUiIdentityOverlayActive({ altKey: false, shiftKey: false })).toBe(false)
  })
})

describe("buildUiIdentityStack", () => {
  test("returns the nearest tagged element followed by tagged ancestors up to the cap", () => {
    const root = createElement("chat.page")
    const transcript = createElement("transcript.message-list", root)
    const message = createElement("message.assistant.response", transcript)
    const leaf = createElement(null, message)

    expect(buildUiIdentityStack(leaf as unknown as HTMLElement, 3)).toEqual([
      message as unknown as HTMLElement,
      transcript as unknown as HTMLElement,
      root as unknown as HTMLElement,
    ])
  })

  test("caps the stack when more tagged ancestors exist than the limit allows", () => {
    const root = createElement("chat.page")
    const sidebar = createElement("chat.sidebar", root)
    const transcript = createElement("transcript.message-list", sidebar)
    const message = createElement("message.assistant.response", transcript)
    const leaf = createElement(null, message)

    expect(buildUiIdentityStack(leaf as unknown as HTMLElement, 2)).toEqual([
      message as unknown as HTMLElement,
      transcript as unknown as HTMLElement,
    ])
  })

  test("returns an empty stack when no tagged ancestor exists", () => {
    const leaf = createElement()
    expect(buildUiIdentityStack(leaf as unknown as HTMLElement, 3)).toEqual([])
  })
})

describe("createUiIdentity", () => {
  test("supports the approved taxonomy kinds and builds persistent hybrid ids", () => {
    const kinds = [
      "area",
      "item",
      "action",
      "menu",
      "dialog",
      "popover",
      "section",
    ] as const satisfies readonly UiIdentityKind[]

    expect(kinds).toEqual([
      "area",
      "item",
      "action",
      "menu",
      "dialog",
      "popover",
      "section",
    ])
    expect(createUiIdentity("chat.page", "area")).toBe("chat.page.area")
    expect(createUiIdentity("settings.general", "section")).toBe("settings.general.section")
  })

  test("builds transient hybrid ids", () => {
    expect(createUiIdentity("sidebar.chat-row", "menu")).toBe("sidebar.chat-row.menu")
    expect(createUiIdentity("chat.preferences", "popover")).toBe("chat.preferences.popover")
    expect(createUiIdentity("project.remove", "dialog")).toBe("project.remove.dialog")
  })
})

describe("getUiIdentityAttributeProps", () => {
  test("returns the data attributes used by tagged surfaces", () => {
    const id = createUiIdentity("chat.page", "area")

    expect(getUiIdentityAttributeProps(id)).toEqual({
      "data-ui-id": "chat.page.area",
    })
  })

  test("emits the visible id plus optional c3 metadata for descriptors", () => {
    const descriptor = createUiIdentityDescriptor({
      id: "chat.navbar.area",
      c3ComponentId: "c3-112",
      c3ComponentLabel: "chat-input",
    })

    expect(getUiIdentityAttributeProps(descriptor)).toEqual({
      "data-ui-id": "chat.navbar.area",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
  })
})

describe("createUiIdentityDescriptor", () => {
  test("stores the visible id and optional c3 metadata together", () => {
    expect(
      createUiIdentityDescriptor({
        id: "rich-content.viewer.area",
        c3ComponentId: "c3-111",
      }),
    ).toEqual<UiIdentityDescriptor>({
      id: "rich-content.viewer.area",
      c3ComponentId: "c3-111",
      c3ComponentLabel: null,
    })
  })
})

describe("formatCopiedUiIdentity", () => {
  test("formats hybrid copied payloads when c3 metadata exists", () => {
    expect(
      formatCopiedUiIdentity({
        id: "rich-content.viewer.area",
        c3ComponentId: "c3-111",
        c3ComponentLabel: null,
      }),
    ).toBe("rich-content.viewer.area | c3:c3-111")
  })

  test("formats the optional c3 label without adding extra spacing noise", () => {
    expect(
      formatCopiedUiIdentity({
        id: "chat.navbar.area",
        c3ComponentId: "c3-112",
        c3ComponentLabel: "chat-input",
      }),
    ).toBe("chat.navbar.area | c3:c3-112(chat-input)")
  })

  test("falls back to the visible id when c3 metadata is absent", () => {
    expect(
      formatCopiedUiIdentity({
        id: "review.diff.area",
        c3ComponentId: null,
        c3ComponentLabel: null,
      }),
    ).toBe("review.diff.area")
  })
})
