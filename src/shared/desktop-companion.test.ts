import { describe, expect, test } from "bun:test"
import {
  normalizeDesktopCompanionManifest,
  resolveDesktopCompanionServerUrl,
} from "./desktop-companion"
import {
  createDesktopCompanionManifest,
} from "../server/server"

describe("normalizeDesktopCompanionManifest", () => {
  test("normalizes a server-only public companion manifest payload", () => {
    expect(
      normalizeDesktopCompanionManifest({
        serverUrl: "http://127.0.0.1:5174",
        appName: "Tinkaria",
        version: "0.16.0",
      })
    ).toEqual({
      serverUrl: "http://127.0.0.1:5174",
      appName: "Tinkaria",
      version: "0.16.0",
    })
  })
})

describe("createDesktopCompanionManifest", () => {
  test("builds an endpoint-ready manifest payload", () => {
    expect(
      createDesktopCompanionManifest({
        serverUrl: "http://127.0.0.1:5174",
        appName: "Tinkaria",
        version: "0.16.0",
      })
    ).toEqual({
      serverUrl: "http://127.0.0.1:5174",
      appName: "Tinkaria",
      version: "0.16.0",
    })
  })
})

describe("resolveDesktopCompanionServerUrl", () => {
  test("prefers the configured public server url over the backend bind port", () => {
    const original = process.env.TINKARIA_PUBLIC_SERVER_URL
    const legacyOriginal = process.env.KANNA_PUBLIC_SERVER_URL

    try {
      delete process.env.KANNA_PUBLIC_SERVER_URL
      process.env.TINKARIA_PUBLIC_SERVER_URL = "http://127.0.0.1:5174"

      expect(resolveDesktopCompanionServerUrl("127.0.0.1", 5175)).toBe(
        "http://127.0.0.1:5174",
      )
    } finally {
      if (original === undefined) {
        delete process.env.TINKARIA_PUBLIC_SERVER_URL
      } else {
        process.env.TINKARIA_PUBLIC_SERVER_URL = original
      }
      if (legacyOriginal === undefined) {
        delete process.env.KANNA_PUBLIC_SERVER_URL
      } else {
        process.env.KANNA_PUBLIC_SERVER_URL = legacyOriginal
      }
    }
  })

  test("falls back to the legacy public server url when the primary override is absent", () => {
    const original = process.env.TINKARIA_PUBLIC_SERVER_URL
    const legacyOriginal = process.env.KANNA_PUBLIC_SERVER_URL

    try {
      delete process.env.TINKARIA_PUBLIC_SERVER_URL
      process.env.KANNA_PUBLIC_SERVER_URL = " http://127.0.0.1:5274 "

      expect(resolveDesktopCompanionServerUrl("127.0.0.1", 3210)).toBe(
        "http://127.0.0.1:5274",
      )
    } finally {
      if (original === undefined) {
        delete process.env.TINKARIA_PUBLIC_SERVER_URL
      } else {
        process.env.TINKARIA_PUBLIC_SERVER_URL = original
      }
      if (legacyOriginal === undefined) {
        delete process.env.KANNA_PUBLIC_SERVER_URL
      } else {
        process.env.KANNA_PUBLIC_SERVER_URL = legacyOriginal
      }
    }
  })

  test("falls back to the backend bind origin when no public url override exists", () => {
    const original = process.env.TINKARIA_PUBLIC_SERVER_URL
    const legacyOriginal = process.env.KANNA_PUBLIC_SERVER_URL

    try {
      delete process.env.TINKARIA_PUBLIC_SERVER_URL
      delete process.env.KANNA_PUBLIC_SERVER_URL

      expect(resolveDesktopCompanionServerUrl("127.0.0.1", 3210)).toBe(
        "http://127.0.0.1:3210",
      )
    } finally {
      if (original === undefined) {
        delete process.env.TINKARIA_PUBLIC_SERVER_URL
      } else {
        process.env.TINKARIA_PUBLIC_SERVER_URL = original
      }
      if (legacyOriginal === undefined) {
        delete process.env.KANNA_PUBLIC_SERVER_URL
      } else {
        process.env.KANNA_PUBLIC_SERVER_URL = legacyOriginal
      }
    }
  })
})
