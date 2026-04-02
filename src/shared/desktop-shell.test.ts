import { describe, expect, test } from "bun:test"
import { DEFAULT_DESKTOP_ATTACH_URL, getDesktopAttachUrl } from "./desktop-shell"

describe("desktop shell attach config", () => {
  test("defaults to the standard local Tinkaria port", () => {
    expect(DEFAULT_DESKTOP_ATTACH_URL).toBe("http://127.0.0.1:3210")
    expect(getDesktopAttachUrl()).toBe("http://127.0.0.1:3210")
  })

  test("prefers the renamed attach URL environment variable", () => {
    expect(getDesktopAttachUrl({ TINKARIA_DESKTOP_ATTACH_URL: "http://127.0.0.1:4000" })).toBe(
      "http://127.0.0.1:4000",
    )
  })

  test("still accepts the legacy attach URL environment variable", () => {
    expect(getDesktopAttachUrl({ KANNA_DESKTOP_ATTACH_URL: "http://127.0.0.1:4000" })).toBe("http://127.0.0.1:4000")
  })
})
