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

  test("backs project page identities with C3-owned descriptors", () => {
    const descriptors = getProjectPageUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.page)).toEqual({
      "data-ui-id": "project.page",
      "data-ui-c3": "c3-117",
      "data-ui-c3-label": "projects",
    })
    expect(getUiIdentityAttributeProps(descriptors.content)).toEqual({
      "data-ui-id": "project.page.content",
      "data-ui-c3": "c3-117",
      "data-ui-c3-label": "projects",
    })
    expect(getUiIdentityAttributeProps(descriptors.extensionsContent)).toEqual({
      "data-ui-id": "project.extensions.content",
      "data-ui-c3": "c3-120",
      "data-ui-c3-label": "extensions",
    })
  })

  test("exposes stable project page identity ids", () => {
    expect(getProjectPageUiIdentities()).toEqual({
      page: "project.page",
      header: "project.page.header",
      backAction: "project.page.back.action",
      tabs: "project.page.tabs",
      content: "project.page.content",
      emptyState: "project.page.empty-state",
      loadingState: "project.page.loading-state",
      extensionsTabs: "project.extensions.tabs",
      extensionsContent: "project.extensions.content",
    })
  })

  test("renders sessions tab as default with project identity metadata", () => {
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

    expect(html).toContain('data-ui-id="project.page"')
    expect(html).toContain('data-ui-c3="c3-117"')
    expect(html).toContain('data-ui-c3-label="projects"')
    expect(html).toContain('data-ui-id="project.page.header"')
    expect(html).toContain('data-ui-id="project.page.tabs"')
    expect(html).toContain('data-ui-id="project.sessions.panel"')
  })
})
