import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { ensureToken, readToken } from "./nats-token"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("nats-token", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "nats-token-test-"))
  })

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  describe("ensureToken", () => {
    test("generates and persists a token when none exists", async () => {
      const token = await ensureToken(dataDir)
      expect(token).toBeString()
      expect(token.length).toBeGreaterThan(20)

      // File should exist now
      const file = Bun.file(join(dataDir, "nats.token"))
      expect(await file.exists()).toBe(true)
      expect((await file.text()).trim()).toBe(token)
    })

    test("returns existing token on subsequent calls", async () => {
      const first = await ensureToken(dataDir)
      const second = await ensureToken(dataDir)
      expect(second).toBe(first)
    })

    test("creates data directory if it does not exist", async () => {
      const nested = join(dataDir, "sub", "deep")
      const token = await ensureToken(nested)
      expect(token).toBeString()
      expect(token.length).toBeGreaterThan(20)
    })
  })

  describe("readToken", () => {
    test("reads token written by ensureToken", async () => {
      const written = await ensureToken(dataDir)
      const read = await readToken(dataDir)
      expect(read).toBe(written)
    })

    test("throws when token file does not exist", async () => {
      expect(readToken(dataDir)).rejects.toThrow()
    })

    test("trims whitespace from token file", async () => {
      await Bun.write(join(dataDir, "nats.token"), "  my-token-value  \n")
      const token = await readToken(dataDir)
      expect(token).toBe("my-token-value")
    })
  })
})
