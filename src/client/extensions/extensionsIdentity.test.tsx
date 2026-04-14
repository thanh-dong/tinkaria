import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import AgentsExtension, { getAgentsExtensionUiIdentityDescriptors } from "./agents/client"
import C3Extension, { getC3ExtensionUiIdentityDescriptors, normalizeC3Entities } from "./c3/client"
import CodeExtension, { getCodeExtensionUiIdentityDescriptors } from "./code/client"

describe("project extension ui identity", () => {
  test("backs C3 extension identities with C3-owned descriptors", () => {
    const descriptors = getC3ExtensionUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.root)).toEqual({
      "data-ui-id": "project.extensions.c3.area",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
    expect(getUiIdentityAttributeProps(descriptors.refreshAction)).toEqual({
      "data-ui-id": "project.extensions.c3.refresh.action",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
  })

  test("normalizes C3 list JSON entities into renderable names", () => {
    expect(
      normalizeC3Entities({
        entities: [
          { id: "c3-1", title: "client", type: "container" },
          { id: "c3-120", title: "extensions", type: "component" },
        ],
      }),
    ).toEqual([
      { id: "c3-1", title: "client", type: "container", name: "client" },
      { id: "c3-120", title: "extensions", type: "component", name: "extensions" },
    ])
  })

  test("backs agents extension identities with C3-owned descriptors", () => {
    expect(getUiIdentityAttributeProps(getAgentsExtensionUiIdentityDescriptors().root)).toEqual({
      "data-ui-id": "project.extensions.agents.area",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
  })

  test("backs code extension identities with C3-owned descriptors", () => {
    expect(getUiIdentityAttributeProps(getCodeExtensionUiIdentityDescriptors().root)).toEqual({
      "data-ui-id": "project.extensions.code.area",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
  })

  test("renders loading extension roots with identity metadata", () => {
    const c3Html = renderToStaticMarkup(createElement(C3Extension, { localPath: "/workspace/demo", groupKey: "demo" }))
    const agentsHtml = renderToStaticMarkup(createElement(AgentsExtension, { localPath: "/workspace/demo", groupKey: "demo" }))
    const codeHtml = renderToStaticMarkup(createElement(CodeExtension, { localPath: "/workspace/demo", groupKey: "demo" }))

    expect(c3Html).toContain('data-ui-id="project.extensions.c3.area"')
    expect(c3Html).toContain('data-ui-c3="c3-120"')
    expect(agentsHtml).toContain('data-ui-id="project.extensions.agents.area"')
    expect(agentsHtml).toContain('data-ui-c3="c3-120"')
    expect(codeHtml).toContain('data-ui-id="project.extensions.code.area"')
    expect(codeHtml).toContain('data-ui-c3="c3-120"')
  })
})
