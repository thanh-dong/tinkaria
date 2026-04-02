import { describe, expect, test } from "bun:test"
import { normalizeDesktopCompanionManifest } from "./desktop-companion"
import { createDesktopCompanionManifest } from "../server/server"

describe("normalizeDesktopCompanionManifest", () => {
  test("normalizes a full companion manifest payload", () => {
    expect(
      normalizeDesktopCompanionManifest({
        serverUrl: "http://127.0.0.1:5174",
        natsUrl: "nats://127.0.0.1:4222",
        natsWsUrl: "ws://127.0.0.1:4223",
        authToken: "token",
        appName: "Tinkaria",
        version: "0.16.0",
      })
    ).toEqual({
      serverUrl: "http://127.0.0.1:5174",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "token",
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
        natsUrl: "nats://127.0.0.1:4222",
        natsWsUrl: "ws://127.0.0.1:4223",
        authToken: "token",
        appName: "Tinkaria",
        version: "0.16.0",
      })
    ).toEqual({
      serverUrl: "http://127.0.0.1:5174",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "token",
      appName: "Tinkaria",
      version: "0.16.0",
    })
  })
})
