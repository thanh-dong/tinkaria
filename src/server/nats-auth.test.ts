import { afterEach, describe, test, expect } from "bun:test"
import { NatsServer } from "@lagz0ne/nats-embedded"
import { connect, type NatsConnection } from "@nats-io/transport-node"
import { generateAuthToken } from "./nats-auth"

let server: NatsServer | null = null
let nc: NatsConnection | null = null

afterEach(async () => {
  if (nc) {
    await nc.drain()
    nc = null
  }
  if (server) {
    await server.stop()
    server = null
  }
})

describe("generateAuthToken", () => {
  test("returns a non-empty string", () => {
    const token = generateAuthToken()
    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
  })

  test("produces unique tokens on each call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateAuthToken()))
    expect(tokens.size).toBe(100)
  })

  test("token has sufficient entropy (>= 32 chars)", () => {
    const token = generateAuthToken()
    expect(token.length).toBeGreaterThanOrEqual(32)
  })
})

describe("NATS token auth integration", () => {
  test("authenticated client connects successfully", async () => {
    const token = generateAuthToken()
    server = await NatsServer.start({ token })
    nc = await connect({ servers: server.url, token })

    // Verify connection works by publishing + subscribing
    const received: string[] = []
    const sub = nc.subscribe("test.auth")
    void (async () => {
      for await (const msg of sub) {
        received.push(new TextDecoder().decode(msg.data))
        sub.unsubscribe()
      }
    })()

    nc.publish("test.auth", new TextEncoder().encode("hello"))
    await nc.flush()
    // Give subscription a moment to process
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(received).toContain("hello")
  })

  test("unauthenticated client is rejected", async () => {
    const token = generateAuthToken()
    server = await NatsServer.start({ token })

    try {
      nc = await connect({ servers: server.url })
      // If connection somehow succeeds, verify it can't operate
      await nc.flush()
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message.toLowerCase()).toMatch(/authorization|auth|denied|closed/)
      nc = null
    }
  })

  test("client with wrong token is rejected", async () => {
    const token = generateAuthToken()
    server = await NatsServer.start({ token })

    try {
      nc = await connect({ servers: server.url, token: "wrong-token" })
      await nc.flush()
      expect(true).toBe(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message.toLowerCase()).toMatch(/authorization|auth|denied|closed/)
      nc = null
    }
  })
})
