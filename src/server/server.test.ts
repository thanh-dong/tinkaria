import { afterEach, describe, expect, test } from "bun:test"
import {
  createNatsWsProxyHandlers,
  NATS_WS_PROXY_BUFFER_LIMIT,
  startServer,
  type NatsWsProxyData,
} from "./server"
import { TranscriptConsumer } from "./transcript-consumer"

type BunServer = ReturnType<typeof Bun.serve>

type UpstreamHarness = {
  server: BunServer
  received: Array<string | Uint8Array>
  stop: () => Promise<void>
  waitForCount: (count: number, timeoutMs?: number) => Promise<void>
  gateOpen: (open: boolean) => void
}

type ProxyHarness = {
  server: BunServer
  counters: ReturnType<typeof createNatsWsProxyHandlers>["counters"]
  stop: () => Promise<void>
  url: string
}

// Fake upstream that gates the WebSocket upgrade behind an explicit open flag
// so tests can reproduce the "client frame arrives before upstream OPEN" race
// without racing real timers.
async function startFakeUpstream(): Promise<UpstreamHarness> {
  const received: Array<string | Uint8Array> = []
  let resolveUpgradeGate: (() => void) | null = null
  let upgradeGate: Promise<void> = new Promise<void>((resolve) => {
    resolveUpgradeGate = resolve
  })

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req, srv) {
      // Block the upgrade response until tests release the gate so the client
      // proxy observes upstream.readyState === CONNECTING for a deterministic
      // window.
      await upgradeGate
      const upgraded = srv.upgrade(req)
      if (upgraded) return undefined
      return new Response("fake upstream upgrade failed", { status: 426 })
    },
    websocket: {
      message(_ws, message) {
        if (typeof message === "string") {
          received.push(message)
        } else {
          received.push(new Uint8Array(message))
        }
      },
    },
  })

  async function waitForCount(count: number, timeoutMs = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (received.length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for upstream to receive ${count} messages (got ${received.length})`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }

  return {
    server,
    received,
    waitForCount,
    gateOpen(open) {
      if (open) {
        resolveUpgradeGate?.()
      } else {
        upgradeGate = new Promise<void>((resolve) => {
          resolveUpgradeGate = resolve
        })
      }
    },
    async stop() {
      resolveUpgradeGate?.()
      server.stop(true)
    },
  }
}

function startProxyHarness(upstream: UpstreamHarness): ProxyHarness {
  const { handlers, counters } = createNatsWsProxyHandlers()
  const upstreamPort = upstream.server.port
  if (typeof upstreamPort !== "number") {
    throw new Error("fake upstream server did not bind a port")
  }
  const server = Bun.serve<NatsWsProxyData>({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      const url = new URL(req.url)
      if (url.pathname === "/nats-ws") {
        const upgraded = srv.upgrade(req, {
          data: {
            wsPort: upstreamPort,
            upstream: null,
            ready: false,
            closed: false,
            buffer: [],
            droppedSinceLastLog: 0,
            openedAt: 0,
            awaitingHello: false,
            skipFirstUpstreamFrame: false,
          },
        })
        if (upgraded) return undefined
        return new Response("proxy upgrade failed", { status: 426 })
      }
      return new Response("not found", { status: 404 })
    },
    websocket: handlers,
  })
  return {
    server,
    counters,
    url: `ws://127.0.0.1:${server.port}/nats-ws`,
    async stop() {
      server.stop(true)
    },
  }
}

async function openClient(url: string): Promise<WebSocket> {
  const client = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      client.removeEventListener("error", onError)
      resolve()
    }
    const onError = () => {
      client.removeEventListener("open", onOpen)
      reject(new Error("client failed to open"))
    }
    client.addEventListener("open", onOpen, { once: true })
    client.addEventListener("error", onError, { once: true })
  })
  return client
}

async function closeClient(client: WebSocket): Promise<void> {
  if (client.readyState === WebSocket.CLOSED) return
  const closed = new Promise<void>((resolve) => {
    client.addEventListener("close", () => resolve(), { once: true })
  })
  client.close()
  await closed
}

describe("startServer healthcheck", () => {
  test("reports liveness with runner", async () => {
    const started = await startServer({ port: 4321, host: "127.0.0.1", strictPort: true })
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/health`)
      expect(response.ok).toBe(true)
      const body = await response.json()
      expect(body).toMatchObject({
        ok: true,
        status: "ok",
        natsDaemon: { ok: true },
        natsConnection: { ok: true },
        runner: {
          ok: true,
          registered: true,
          heartbeatFresh: true,
        },
      })
      expect(typeof body.runner.runnerId).toBe("string")
      expect(typeof body.runner.pid).toBe("number")
    } finally {
      await started.stop()
    }
  }, 30_000)

  test("waits for transcript consumer startup before server resolves", async () => {
    const originalStart = TranscriptConsumer.prototype.start
    let releaseStart!: () => void
    const startEntered = new Promise<void>((resolve) => {
      TranscriptConsumer.prototype.start = async function(this: TranscriptConsumer) {
        resolve()
        await new Promise<void>((resume) => {
          releaseStart = resume
        })
        return originalStart.call(this)
      }
    })

    let started: Awaited<ReturnType<typeof startServer>> | null = null
    const serverPromise = startServer({ port: 4323, host: "127.0.0.1", strictPort: true })

    try {
      await startEntered
      const resolvedBeforeConsumerReady = await Promise.race([
        serverPromise.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 200)),
      ])
      expect(resolvedBeforeConsumerReady).toBe(false)

      releaseStart()
      started = await serverPromise
    } finally {
      TranscriptConsumer.prototype.start = originalStart
      await started?.stop()
    }
  }, 30_000)
})

describe("startServer pug preview route", () => {
  test("compiles pug previews for generic UI embeds", async () => {
    const started = await startServer({ port: 4325, host: "127.0.0.1", strictPort: true })
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/api/render/pug`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ source: "main\n  h1 Hello" }),
      })
      expect(response.ok).toBe(true)
      await expect(response.json()).resolves.toEqual({
        html: "<main><h1>Hello</h1></main>",
      })
    } finally {
      await started.stop()
    }
  }, 30_000)

  test("returns pug render errors without crashing the route", async () => {
    const started = await startServer({ port: 4326, host: "127.0.0.1", strictPort: true })
    try {
      const response = await fetch(`http://127.0.0.1:${started.port}/api/render/pug`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ source: "main(\n  h1 Hello" }),
      })
      expect(response.ok).toBe(true)
      const body = await response.json() as { error?: string }
      expect(body.error).toContain("no closing bracket")
    } finally {
      await started.stop()
    }
  }, 30_000)
})

describe("/nats-ws proxy upstream race", () => {
  let harnesses: Array<{ stop: () => Promise<void> }> = []

  afterEach(async () => {
    const pending = harnesses.slice().reverse()
    harnesses = []
    for (const h of pending) {
      try {
        await h.stop()
      } catch {
        // best-effort cleanup — other harnesses must still be torn down.
      }
    }
  })

  test("frames sent before upstream opens are still delivered", async () => {
    const upstream = await startFakeUpstream()
    harnesses.push(upstream)
    const proxy = startProxyHarness(upstream)
    harnesses.push(proxy)

    const client = await openClient(proxy.url)
    // The fake upstream has NOT resolved its upgrade gate yet, so the proxy's
    // upstream WebSocket is still CONNECTING. The pre-fix proxy would throw
    // `InvalidStateError` inside `ws.data.upstream?.send(message)` here.
    client.send("EARLY_FRAME")

    // Release the upstream upgrade gate so the proxy can drain the buffer.
    upstream.gateOpen(true)
    await upstream.waitForCount(1, 2_000)

    expect(upstream.received[0]).toBe("EARLY_FRAME")
    await closeClient(client)
  }, 10_000)

  test("buffer drops oldest when over NATS_WS_PROXY_BUFFER_LIMIT", async () => {
    const upstream = await startFakeUpstream()
    harnesses.push(upstream)
    const proxy = startProxyHarness(upstream)
    harnesses.push(proxy)

    const client = await openClient(proxy.url)

    const overflow = 10
    const totalSent = NATS_WS_PROXY_BUFFER_LIMIT + overflow
    for (let i = 0; i < totalSent; i++) {
      client.send(`frame-${i}`)
    }

    // Yield so Bun delivers all client frames to the proxy handler while the
    // upstream upgrade gate is still closed. Without this, the messages can
    // still be queued in the event loop when we release the gate below.
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (proxy.counters.bufferDrops >= overflow) break
    }
    expect(proxy.counters.bufferDrops).toBe(overflow)

    upstream.gateOpen(true)
    await upstream.waitForCount(NATS_WS_PROXY_BUFFER_LIMIT, 3_000)

    // Received should be exactly the last NATS_WS_PROXY_BUFFER_LIMIT frames
    // in insertion order.
    expect(upstream.received.length).toBe(NATS_WS_PROXY_BUFFER_LIMIT)
    expect(upstream.received[0]).toBe(`frame-${overflow}`)
    expect(upstream.received[upstream.received.length - 1]).toBe(`frame-${totalSent - 1}`)

    await closeClient(client)
  }, 10_000)
})
