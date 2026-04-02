import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LocalDev, getDesktopRendererStatusLabel, getDesktopSmokeMarkdown } from "./LocalDev"

describe("getDesktopRendererStatusLabel", () => {
  test("reports when a native desktop renderer is available", () => {
    expect(getDesktopRendererStatusLabel({
      renderers: [
        {
          rendererId: "desktop-1",
          machineName: "Workstation",
          capabilities: ["native_webview"],
          connectedAt: 1,
          lastSeenAt: 1,
        },
      ],
    })).toBe("Desktop renderer ready")
  })

  test("reports when no native desktop renderer is connected", () => {
    expect(getDesktopRendererStatusLabel({ renderers: [] })).toBe("Waiting for a desktop renderer")
  })
})

describe("getDesktopSmokeMarkdown", () => {
  test("returns the stable smoke links for local and remote targets", () => {
    expect(getDesktopSmokeMarkdown()).toContain("[Local smoke target](http://127.0.0.1:3210/)")
    expect(getDesktopSmokeMarkdown()).toContain("[Remote smoke target](https://example.com/)")
  })
})

describe("LocalDev desktop smoke card", () => {
  test("renders the desktop smoke section on the connected projects page", () => {
    const html = renderToStaticMarkup(
      <LocalDev
        connectionStatus="connected"
        ready
        snapshot={{
          machine: {
            id: "local",
            displayName: "Local Projects",
          },
          projects: [],
        }}
        desktopRenderers={{
          renderers: [
            {
              rendererId: "desktop-1",
              machineName: "Workstation",
              capabilities: ["native_webview"],
              connectedAt: 1,
              lastSeenAt: 1,
            },
          ],
        }}
        startingLocalPath={null}
        commandError={null}
        onOpenProject={async () => {}}
        onCreateProject={async () => {}}
        onOpenExternalLink={() => false}
      />
    )

    expect(html).toContain("Desktop Smoke")
    expect(html).toContain("Desktop renderer ready")
    expect(html).toContain("http://127.0.0.1:3210/")
    expect(html).toContain("https://example.com/")
  })
})
