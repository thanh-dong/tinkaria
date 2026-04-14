import { describe, test, expect } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"
import { getProjectPageUiIdentityDescriptors, getProjectPageUiIdentities, ProjectPage } from "./ProjectPage"

describe("ProjectPage", () => {
  test("exports ProjectPage component", () => {
    expect(typeof ProjectPage).toBe("function")
  })

  test("backs project extension screen identities with C3-owned descriptors", () => {
    const descriptors = getProjectPageUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.page)).toEqual({
      "data-ui-id": "project.extensions.page",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
    expect(getUiIdentityAttributeProps(descriptors.content)).toEqual({
      "data-ui-id": "project.extensions.content",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
  })

  test("exposes stable project extension identity ids", () => {
    expect(getProjectPageUiIdentities()).toEqual({
      page: "project.extensions.page",
      header: "project.extensions.header",
      backAction: "project.extensions.back.action",
      tabs: "project.extensions.tabs",
      content: "project.extensions.content",
      emptyState: "project.extensions.empty-state",
      loadingState: "project.extensions.loading-state",
    })
  })

  test("renders loading state with project extension identity metadata", () => {
    const state = {
      socket: null,
      sidebarData: {
        workspaceGroups: [{ groupKey: "demo", localPath: "/workspace/demo", chats: [] }],
      },
    }

    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/project/demo"] },
        createElement(Routes, null,
          createElement(Route, {
            path: "/project",
            element: createElement(Outlet, { context: state }),
          },
            createElement(Route, {
              path: ":groupKey",
              element: createElement(ProjectPage),
            }),
          ),
        ),
      ),
    )

    expect(html).toContain('data-ui-id="project.extensions.page"')
    expect(html).toContain('data-ui-c3="c3-120"')
    expect(html).toContain('data-ui-c3-label="extensions"')
    expect(html).toContain('data-ui-id="project.extensions.header"')
    expect(html).toContain('data-ui-id="project.extensions.loading-state"')
  })
})
