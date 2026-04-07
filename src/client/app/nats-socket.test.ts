import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { reactivateSubscriptionsAfterReconnect, resetSubscriptionEntryForReconnect } from "./nats-socket"

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

// Now safe to import
const { NatsSocket } = await import("./nats-socket")

function flushNextTimer() {
  const entry = timers.shift()
  if (entry) entry.cb()
}

beforeEach(() => {
  timers.length = 0
  nextTimerId = 1

  // @ts-expect-error -- simplified mock
  globalThis.setTimeout = capturableSetTimeout
  // @ts-expect-error -- simplified mock
  window.setTimeout = capturableSetTimeout
  globalThis.clearTimeout = () => {}
  window.clearTimeout = () => {}
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
    expect(timers[0].delay).toBe(250)

    // Fire reconnect, let it fail again, check doubling
    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0].delay).toBe(500)

    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0].delay).toBe(1000)

    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0].delay).toBe(2000)

    // Next doubling would be 4000, but should cap at 3000
    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0].delay).toBe(3000)

    // Should stay capped
    flushNextTimer()
    await Promise.resolve()
    await Promise.resolve()

    expect(timers.length).toBe(1)
    expect(timers[0].delay).toBe(3000)

    socket.dispose()
  })
})

describe("NatsSocket JetStream integration", () => {
  test("CHAT_MESSAGE_EVENTS_STREAM_NAME is the correct stream name", async () => {
    const { CHAT_MESSAGE_EVENTS_STREAM_NAME } = await import("../../shared/nats-subjects")
    expect(CHAT_MESSAGE_EVENTS_STREAM_NAME).toBe("KANNA_CHAT_MESSAGE_EVENTS")
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
