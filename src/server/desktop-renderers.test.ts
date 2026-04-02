import { describe, expect, test } from "bun:test"
import { DesktopRenderersRegistry } from "./desktop-renderers"

describe("DesktopRenderersRegistry", () => {
  test("registers and snapshots desktop renderers", () => {
    const registry = new DesktopRenderersRegistry()

    registry.register({
      rendererId: "desktop-1",
      machineName: "Workstation",
      capabilities: ["native_webview"],
    }, 100)

    expect(registry.getSnapshot()).toEqual({
      renderers: [
        {
          rendererId: "desktop-1",
          machineName: "Workstation",
          capabilities: ["native_webview"],
          connectedAt: 100,
          lastSeenAt: 100,
        },
      ],
    })
  })

  test("refreshes lastSeenAt without changing connectedAt", () => {
    const registry = new DesktopRenderersRegistry()
    registry.register({
      rendererId: "desktop-1",
      machineName: "Workstation",
      capabilities: ["native_webview"],
    }, 100)

    registry.register({
      rendererId: "desktop-1",
      machineName: "Workstation",
      capabilities: ["native_webview", "popout"],
    }, 200)

    expect(registry.getSnapshot()).toEqual({
      renderers: [
        {
          rendererId: "desktop-1",
          machineName: "Workstation",
          capabilities: ["native_webview", "popout"],
          connectedAt: 100,
          lastSeenAt: 200,
        },
      ],
    })
  })

  test("unregister removes the renderer", () => {
    const registry = new DesktopRenderersRegistry()
    registry.register({
      rendererId: "desktop-1",
      machineName: "Workstation",
      capabilities: ["native_webview"],
    })

    registry.unregister("desktop-1")

    expect(registry.getSnapshot()).toEqual({ renderers: [] })
  })
})
