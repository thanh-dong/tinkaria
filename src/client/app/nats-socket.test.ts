import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

// NatsSocket uses `window.setTimeout` — provide the global before importing
const timers: Array<{ cb: () => void; delay: number }> = []
let nextTimerId = 1

function capturableSetTimeout(cb: () => void, delay: number): number {
  timers.push({ cb, delay })
  return nextTimerId++
}

// @ts-expect-error -- shim window for browser-only module
globalThis.window ??= globalThis
const savedSetTimeout = globalThis.setTimeout
const savedClearTimeout = globalThis.clearTimeout
const savedFetch = globalThis.fetch

// Minimal window.location shim — individual tests override `protocol` as needed
// @ts-expect-error -- partial shim, nats-socket only reads protocol + host
window.location ??= { protocol: "http:", host: "localhost:3210" }

// Mutable wsconnect implementation — tests replace this between calls.
// Default throws to catch accidental real connection attempts in unrelated tests.
type WsConnectArgs = { servers?: string | string[]; token?: string }
type FakeNatsConnection = {
  close: () => Promise<void>
  drain: () => Promise<void>
  status: () => AsyncIterable<{ type: string }>
  subscribe: (subject: string) => { unsubscribe: () => void }
  request: (subject: string, payload: Uint8Array, opts?: { timeout: number }) => Promise<{ data: Uint8Array }>
}

let wsconnectImpl: (opts: WsConnectArgs) => Promise<FakeNatsConnection> = async () => {
  throw new Error("wsconnectImpl not configured for this test")
}

await mock.module("@nats-io/nats-core", () => ({
  wsconnect: (opts: WsConnectArgs) => wsconnectImpl(opts),
}))

await mock.module("@nats-io/jetstream", () => ({
  jetstream: () => ({
    consumers: {
      get: async () => ({
        consume: async () => ({
          close: async () => {},
          [Symbol.asyncIterator]: async function* () {},
        }),
      }),
    },
  }),
  DeliverPolicy: { New: "new" },
}))

// Now safe to import the module under test (mocks are in place)
const {
  NatsSocket,
  reactivateSubscriptionsAfterReconnect,
  resetSubscriptionEntryForReconnect,
} = await import("./nats-socket")

function flushNextTimer() {
  const entry = timers.shift()
  if (entry) entry.cb()
}

/** Build a minimal fake NatsConnection for tests that care about the handle but not the transport. */
function makeFakeNc(overrides: Partial<FakeNatsConnection> = {}): FakeNatsConnection {
  return {
    close: async () => {},
    drain: async () => {},
    status: async function* () {},
    subscribe: () => ({ unsubscribe: () => {} }),
    request: async () => ({ data: new TextEncoder().encode(JSON.stringify({ ok: true, result: {} })) }),
    ...overrides,
  }
}

beforeEach(() => {
  timers.length = 0
  nextTimerId = 1
  wsconnectImpl = async () => { throw new Error("wsconnectImpl not configured for this test") }

  // @ts-expect-error -- simplified mock
  globalThis.setTimeout = capturableSetTimeout
  // @ts-expect-error -- simplified mock
  window.setTimeout = capturableSetTimeout
  globalThis.clearTimeout = () => {}
  window.clearTimeout = () => {}
  // Default protocol — individual tests override as needed
  window.location.protocol = "http:"
  window.location.host = "localhost:3210"
})

afterEach(() => {
  globalThis.setTimeout = savedSetTimeout
  globalThis.clearTimeout = savedClearTimeout
  globalThis.fetch = savedFetch
  window.setTimeout = savedSetTimeout as typeof window.setTimeout
  window.clearTimeout = savedClearTimeout as typeof window.clearTimeout
})

describe("NatsSocket reconnect", () => {
  test("retries fetch('/auth/token') on reconnect after initial discovery failure", async () => {
    const fetchMock = mock(() => Promise.reject(new Error("server down")))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const socket = new NatsSocket()
    socket.start()

    // Wait for the initial discoverAndConnect promise to settle
    await Promise.resolve()
    await Promise.resolve()

    // First call: the initial discoverAndConnect
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(timers.length).toBe(1)

    // Fire the reconnect timer -- this should call discoverAndConnect again
    fetchMock.mockClear()
    flushNextTimer()

    await Promise.resolve()
    await Promise.resolve()

    // Second call: reconnect should re-discover (call fetch again)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    socket.dispose()
  })

  test("reconnect delay starts at 250ms and caps at 3000ms", async () => {
    const fetchMock = mock(() => Promise.reject(new Error("server down")))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const socket = new NatsSocket()
    socket.start()

    // Let initial discoverAndConnect settle
    await Promise.resolve()
    await Promise.resolve()

    // First reconnect should be scheduled at the initial delay (250ms)
    expect(timers.length).toBe(1)
    expect(timers[0]!.delay).toBe(250)

    // Fire reconnect, let it fail again, check doubling
    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0]!.delay).toBe(500)

    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0]!.delay).toBe(1000)

    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0]!.delay).toBe(2000)

    // Next doubling would be 4000, but should cap at 3000
    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0]!.delay).toBe(3000)

    // Should stay capped
    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0]!.delay).toBe(3000)

    socket.dispose()
  })
})

describe("NatsSocket JetStream integration", () => {
  test("CHAT_MESSAGE_EVENTS_STREAM_NAME is the correct stream name", async () => {
    const { CHAT_MESSAGE_EVENTS_STREAM_NAME } = await import("../../shared/nats-subjects")
    expect(CHAT_MESSAGE_EVENTS_STREAM_NAME).toBe("KANNA_CHAT_MESSAGE_EVENTS")
  })
})

describe("NatsSocket command", () => {
  test("uses the provided timeout override for long-running commands", async () => {
    const request = mock(async (_subject: string, _payload: Uint8Array, options: { timeout: number }) => {
      expect(options.timeout).toBe(120_000)
      return { data: new TextEncoder().encode(JSON.stringify({ ok: true, result: { ok: true } })) }
    })

    const socket = new NatsSocket() as unknown as { nc: { request: typeof request }; command: (cmd: unknown, opts?: { timeoutMs?: number }) => Promise<unknown> }
    socket.nc = { request }

    await expect(socket.command({ type: "system.ping" }, { timeoutMs: 120_000 })).resolves.toEqual({ ok: true })
  })
})

describe("resetSubscriptionEntryForReconnect", () => {
  test("closes stale subscription handles and clears the entry", () => {
    const unsubscribeSnapshot = mock(() => {})
    const unsubscribeEvents = mock(() => {})
    const closeConsumer = mock(async () => {})
    const entry = {
      natsSubscription: { unsubscribe: unsubscribeSnapshot } as never,
      eventSubscription: { unsubscribe: unsubscribeEvents } as never,
      consumerMessages: { close: closeConsumer } as never,
    }

    resetSubscriptionEntryForReconnect(entry)

    expect(unsubscribeSnapshot).toHaveBeenCalledTimes(1)
    expect(unsubscribeEvents).toHaveBeenCalledTimes(1)
    expect(closeConsumer).toHaveBeenCalledTimes(1)
    expect(entry.natsSubscription).toBeNull()
    expect(entry.eventSubscription).toBeNull()
    expect(entry.consumerMessages).toBeNull()
  })
})

describe("reactivateSubscriptionsAfterReconnect", () => {
  test("re-subscribes every active topic after reconnect, even when stale handles exist", () => {
    const staleSnapshotUnsubscribe = mock(() => {})
    const staleEventsUnsubscribe = mock(() => {})
    const staleConsumerClose = mock(async () => {})
    const idleEntry = {
      natsSubscription: null,
      eventSubscription: null,
      consumerMessages: null,
    }
    const busyEntry = {
      natsSubscription: { unsubscribe: staleSnapshotUnsubscribe } as never,
      eventSubscription: { unsubscribe: staleEventsUnsubscribe } as never,
      consumerMessages: { close: staleConsumerClose } as never,
    }
    const entries = new Map<string, typeof busyEntry | typeof idleEntry>([
      ["chat-1", busyEntry],
      ["chat-2", idleEntry],
    ])
    const activatedIds: string[] = []

    reactivateSubscriptionsAfterReconnect(entries, (id) => {
      activatedIds.push(id)
    })

    expect(staleSnapshotUnsubscribe).toHaveBeenCalledTimes(1)
    expect(staleEventsUnsubscribe).toHaveBeenCalledTimes(1)
    expect(staleConsumerClose).toHaveBeenCalledTimes(1)
    expect(activatedIds).toEqual(["chat-1", "chat-2"])
    expect(busyEntry.natsSubscription).toBeNull()
    expect(busyEntry.eventSubscription).toBeNull()
    expect(busyEntry.consumerMessages).toBeNull()
  })
})

// ─── P1-B: double-open race ──────────────────────────────────────────────

describe("NatsSocket double-open race", () => {
  test("discoverAndConnect on HTTPS makes exactly one wsconnect call (ignoring natsWsUrl)", async () => {
    window.location.protocol = "https:"
    window.location.host = "example.com"

    const fetchMock = mock(async () => ({
      json: async () => ({ token: "tok", natsWsUrl: "ws://ignored.example:4222" }),
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const servers: string[] = []
    wsconnectImpl = async (opts) => {
      const s = Array.isArray(opts.servers) ? opts.servers.join(",") : (opts.servers ?? "")
      servers.push(s)
      return makeFakeNc()
    }

    const socket = new NatsSocket()
    socket.start()

    // Drain microtasks
    for (let i = 0; i < 10; i++) await Promise.resolve()

    // HTTPS path must use proxy, once, and must ignore the natsWsUrl.
    expect(servers.length).toBe(1)
    expect(servers[0]).toBe("wss://example.com/nats-ws")
    expect(servers[0]).not.toContain("ignored.example")

    socket.dispose()
  })

  test("HTTP with failing natsWsUrl falls back to proxy with exactly 2 wsconnect calls (sequential)", async () => {
    window.location.protocol = "http:"
    window.location.host = "localhost:3210"

    const fetchMock = mock(async () => ({
      json: async () => ({ token: "tok", natsWsUrl: "ws://direct.example:4222" }),
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const servers: string[] = []
    let callCount = 0
    wsconnectImpl = async (opts) => {
      callCount++
      const s = Array.isArray(opts.servers) ? opts.servers.join(",") : (opts.servers ?? "")
      servers.push(s)
      if (callCount === 1) {
        throw new Error("Connection refused")
      }
      return makeFakeNc()
    }

    const socket = new NatsSocket()
    socket.start()

    for (let i = 0; i < 20; i++) await Promise.resolve()

    expect(servers.length).toBe(2)
    expect(servers[0]).toBe("ws://direct.example:4222")
    expect(servers[1]).toBe("ws://localhost:3210/nats-ws")

    socket.dispose()
  })

  test("HTTP with hanging natsWsUrl does not start a second wsconnect in parallel", async () => {
    window.location.protocol = "http:"
    window.location.host = "localhost:3210"

    const fetchMock = mock(async () => ({
      json: async () => ({ token: "tok", natsWsUrl: "ws://direct.example:4222" }),
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const servers: string[] = []
    // 1st wsconnect call hangs (never resolves), subsequent resolves.
    // This is the scenario that currently causes the race: probe timer
    // forces fallback to proxy while the first wsconnect is still in flight.
    wsconnectImpl = async (opts) => {
      const s = Array.isArray(opts.servers) ? opts.servers.join(",") : (opts.servers ?? "")
      servers.push(s)
      if (servers.length === 1) {
        // Hang forever
        return await new Promise<FakeNatsConnection>(() => {})
      }
      return makeFakeNc()
    }

    const socket = new NatsSocket()
    socket.start()

    for (let i = 0; i < 10; i++) await Promise.resolve()

    // After start + discovery, exactly one wsconnect has been initiated.
    expect(servers.length).toBe(1)
    expect(servers[0]).toBe("ws://direct.example:4222")

    // Under the buggy code, a probe timeout timer was scheduled — flushing it
    // would trigger a second, parallel wsconnect. Under the fix, no timer
    // exists and the single hanging connect stays single.
    while (timers.length > 0) flushNextTimer()
    for (let i = 0; i < 10; i++) await Promise.resolve()

    expect(servers.length).toBe(1)

    socket.dispose()
  })
})

// ─── P1-C: resetConnection orphan fix ──────────────────────────────────

describe("NatsSocket resetConnection", () => {
  test("closes nc before nulling", async () => {
    const closeMock = mock(async () => {})
    const drainMock = mock(async () => {})
    const socket = new NatsSocket() as unknown as {
      nc: { close: typeof closeMock; drain: typeof drainMock } | null
      js: object | null
      resetConnection: () => Promise<void>
    }
    socket.nc = { close: closeMock, drain: drainMock }
    socket.js = {}

    await socket.resetConnection()

    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(socket.nc).toBeNull()
    expect(socket.js).toBeNull()
  })

  test("resetConnection is re-entrance safe — second call does not double-close", async () => {
    let closeCalls = 0
    const closeMock = mock(async () => {
      closeCalls++
    })
    const socket = new NatsSocket() as unknown as {
      nc: { close: typeof closeMock; drain: () => Promise<void> } | null
      js: object | null
      resetConnection: () => Promise<void>
    }
    socket.nc = { close: closeMock, drain: async () => {} }
    socket.js = {}

    // Fire two concurrent resets; only one close should actually be issued
    // because the second call sees the resetting flag / already-null nc.
    const first = socket.resetConnection()
    const second = socket.resetConnection()
    await Promise.all([first, second])

    expect(closeCalls).toBe(1)
    expect(socket.nc).toBeNull()
    expect(socket.js).toBeNull()
  })
})

// ─── P1-D: monitorStatus single-loop invariant ─────────────────────────

/** Build a controllable status stream for testing monitorStatus. */
function makeStatusStream(): {
  iterator: () => AsyncIterable<{ type: string }>
  emit: (type: string) => void
  close: () => void
} {
  type Resolver = (value: IteratorResult<{ type: string }>) => void
  const resolvers: Resolver[] = []
  const pending: IteratorResult<{ type: string }>[] = []
  let closed = false

  const push = (value: IteratorResult<{ type: string }>) => {
    const resolver = resolvers.shift()
    if (resolver) resolver(value)
    else pending.push(value)
  }

  return {
    iterator: () => ({
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<{ type: string }>> {
            if (closed) return Promise.resolve({ value: undefined, done: true })
            const queued = pending.shift()
            if (queued) return Promise.resolve(queued)
            return new Promise<IteratorResult<{ type: string }>>((resolve) => resolvers.push(resolve))
          },
        }
      },
    }),
    emit: (type: string) => { push({ value: { type }, done: false }) },
    close: () => {
      closed = true
      push({ value: undefined, done: true } as IteratorResult<{ type: string }>)
    },
  }
}

describe("NatsSocket monitorStatus", () => {
  test("reactivation uses captured nc, not this.nc, after reconnect swap", async () => {
    const streamA = makeStatusStream()
    const subscribeA = mock(() => ({ unsubscribe: () => {} }))
    const subscribeB = mock(() => ({ unsubscribe: () => {} }))
    const requestA = mock(async () => ({
      data: new TextEncoder().encode(JSON.stringify({ ok: true, result: {} })),
    }))

    const ncA = makeFakeNc({
      status: () => streamA.iterator(),
      subscribe: subscribeA,
      request: requestA,
    })
    const ncB = makeFakeNc({
      subscribe: subscribeB,
    })

    const socket = new NatsSocket() as unknown as {
      nc: FakeNatsConnection | null
      js: object | null
      started: boolean
      subscriptions: Map<string, {
        topic: { type: string; terminalId: string }
        natsSubscription: { unsubscribe: () => void } | null
        eventSubscription: { unsubscribe: () => void } | null
        consumerMessages: null
        snapshotListener: (v: unknown) => void
        eventListener: (v: unknown) => void
      }>
      monitorStatus: () => Promise<void>
    }
    socket.nc = ncA
    socket.js = {}
    socket.started = true
    socket.subscriptions.set("sub-1", {
      topic: { type: "terminal", terminalId: "term-1" },
      natsSubscription: null,
      eventSubscription: null,
      consumerMessages: null,
      snapshotListener: () => {},
      eventListener: () => {},
    })

    const monitorPromise = socket.monitorStatus()

    // Simulate a concurrent connect that reassigned this.nc before the
    // reconnect status event arrives on the captured nc's iterator.
    socket.nc = ncB
    socket.js = {}

    streamA.emit("reconnect")
    for (let i = 0; i < 10; i++) await Promise.resolve()

    // Captured-nc subscribe must be the only one touched by reactivation.
    expect(subscribeA).toHaveBeenCalled()
    expect(subscribeB).not.toHaveBeenCalled()

    // Tear down so the monitor loop exits
    socket.started = false
    streamA.close()
    await monitorPromise.catch(() => {})
  })

  test("monitorStatus exits quietly when this.nc has been reassigned (no scheduleReconnect)", async () => {
    const streamA = makeStatusStream()
    const ncA = makeFakeNc({ status: () => streamA.iterator() })
    const ncB = makeFakeNc({})

    const socket = new NatsSocket() as unknown as {
      nc: FakeNatsConnection | null
      js: object | null
      started: boolean
      reconnecting: boolean
      currentStatus: string
      monitorStatus: () => Promise<void>
    }
    socket.nc = ncA
    socket.js = {}
    socket.started = true

    const monitorPromise = socket.monitorStatus()

    // Reassign nc BEFORE closing streamA — successor connect is logically in place.
    socket.nc = ncB
    socket.js = {}

    // Close the captured stream to force the loop to exit
    streamA.close()
    for (let i = 0; i < 10; i++) await Promise.resolve()

    await monitorPromise

    // Since this.nc was reassigned, the monitor must NOT have scheduled a reconnect
    // (which would push onto the timers queue).
    expect(timers.length).toBe(0)
  })
})
