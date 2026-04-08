import { describe, test, expect, afterEach } from "bun:test"
import { connect } from "@nats-io/transport-node"

describe("nats-daemon", () => {
  let proc: ReturnType<typeof Bun.spawn> | null = null

  afterEach(async () => {
    if (proc) {
      proc.kill("SIGTERM")
      await proc.exited
      proc = null
    }
  })

  test("starts and outputs JSON with url, wsUrl, wsPort, pid", async () => {
    const token = "test-token-" + Date.now()
    proc = Bun.spawn(["bun", "run", "src/nats/nats-daemon.ts"], {
      env: { ...process.env, NATS_TOKEN: token },
      stdio: ["ignore", "pipe", "inherit"],
    })
    const reader = proc.stdout.getReader()
    const { value } = await reader.read()
    const info = JSON.parse(new TextDecoder().decode(value))
    expect(info).toHaveProperty("url")
    expect(info).toHaveProperty("wsUrl")
    expect(info).toHaveProperty("wsPort")
    expect(info).toHaveProperty("pid")
    expect(typeof info.pid).toBe("number")
  })

  test("accepts NATS connections with token auth", async () => {
    const token = "test-token-" + Date.now()
    proc = Bun.spawn(["bun", "run", "src/nats/nats-daemon.ts"], {
      env: { ...process.env, NATS_TOKEN: token },
      stdio: ["ignore", "pipe", "inherit"],
    })
    const reader = proc.stdout.getReader()
    const { value } = await reader.read()
    const info = JSON.parse(new TextDecoder().decode(value))

    const nc = await connect({ servers: info.url, token })
    expect(nc).toBeDefined()
    await nc.drain()
  })

  test("shuts down cleanly on SIGTERM", async () => {
    proc = Bun.spawn(["bun", "run", "src/nats/nats-daemon.ts"], {
      env: { ...process.env, NATS_TOKEN: "test" },
      stdio: ["ignore", "pipe", "inherit"],
    })
    const reader = proc.stdout.getReader()
    await reader.read() // wait for startup

    proc.kill("SIGTERM")
    const exitCode = await proc.exited
    expect(exitCode).toBe(0)
    proc = null // already exited
  })
})
