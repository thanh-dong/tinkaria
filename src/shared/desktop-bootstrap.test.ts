import { describe, expect, test } from "bun:test"
import {
  getDesktopBootstrapFilePath,
  getDesktopBootstrapFilePathDisplay,
  parseDesktopBootstrap,
  serializeDesktopBootstrap,
} from "./desktop-bootstrap"

describe("desktop bootstrap contract", () => {
  test("derives the desktop bootstrap path from the branded data dir", () => {
    expect(getDesktopBootstrapFilePath("/tmp/home", {})).toBe(
      "/tmp/home/.tinkaria/data/desktop-bootstrap.json",
    )
    expect(getDesktopBootstrapFilePathDisplay({})).toBe("~/.tinkaria/data/desktop-bootstrap.json")
    expect(getDesktopBootstrapFilePath("/tmp/home", { TINKARIA_RUNTIME_PROFILE: "dev" })).toBe(
      "/tmp/home/.tinkaria-dev/data/desktop-bootstrap.json",
    )
  })

  test("round-trips the NATS bootstrap payload through JSON", () => {
    const bootstrap = {
      serverUrl: "http://127.0.0.1:5175",
      natsUrl: "nats://127.0.0.1:4222",
      natsWsUrl: "ws://127.0.0.1:4223",
      authToken: "secret-token",
    }

    expect(parseDesktopBootstrap(serializeDesktopBootstrap(bootstrap))).toEqual(bootstrap)
  })
})
