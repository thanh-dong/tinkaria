import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  DesktopCompanionPageBody,
  findDesktopRendererSnapshot,
  getDesktopCompanionStatusLabel,
} from "./DesktopCompanionPage"

describe("findDesktopRendererSnapshot", () => {
  test("returns the matching renderer by id", () => {
    expect(findDesktopRendererSnapshot({
      renderers: [
        {
          rendererId: "desktop:LAGZ0NE",
          machineName: "LAGZ0NE",
          capabilities: ["native_webview"],
          serverUrl: "http://127.0.0.1:5175",
          natsUrl: "nats://127.0.0.1:4222",
          lastError: null,
          connectedAt: 100,
          lastSeenAt: 120,
        },
      ],
    }, "desktop:LAGZ0NE")?.machineName).toBe("LAGZ0NE")
  })
})

describe("getDesktopCompanionStatusLabel", () => {
  test("distinguishes connected, warning, and offline states", () => {
    expect(getDesktopCompanionStatusLabel(null)).toBe("Offline")
    expect(getDesktopCompanionStatusLabel({
      rendererId: "desktop:LAGZ0NE",
      machineName: "LAGZ0NE",
      capabilities: ["native_webview"],
      serverUrl: "http://127.0.0.1:5175",
      natsUrl: "nats://127.0.0.1:4222",
      lastError: null,
      connectedAt: 100,
      lastSeenAt: 120,
    })).toBe("Connected")
    expect(getDesktopCompanionStatusLabel({
      rendererId: "desktop:LAGZ0NE",
      machineName: "LAGZ0NE",
      capabilities: ["native_webview"],
      serverUrl: "http://127.0.0.1:5175",
      natsUrl: "nats://127.0.0.1:4222",
      lastError: "connect failed once",
      connectedAt: 100,
      lastSeenAt: 120,
    })).toBe("Connected with warnings")
  })
})

describe("DesktopCompanionPageBody", () => {
  test("renders renderer-scoped desktop details in the main app style", () => {
    const html = renderToStaticMarkup(createElement(DesktopCompanionPageBody, {
      rendererId: "desktop:LAGZ0NE",
      renderer: {
        rendererId: "desktop:LAGZ0NE",
        machineName: "LAGZ0NE",
        capabilities: ["native_webview", "console_capture"],
        serverUrl: "http://127.0.0.1:5175",
        natsUrl: "nats://127.0.0.1:4222",
        lastError: null,
        connectedAt: Date.parse("2026-04-03T05:00:00.000Z"),
        lastSeenAt: Date.parse("2026-04-03T05:05:00.000Z"),
      },
    }))

    expect(html).toContain("Desktop Companion")
    expect(html).toContain("desktop:LAGZ0NE")
    expect(html).toContain("http://127.0.0.1:5175")
    expect(html).toContain("nats://127.0.0.1:4222")
    expect(html).toContain("native_webview, console_capture")
  })
})
