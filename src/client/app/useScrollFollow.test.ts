import { afterEach, describe, expect, mock, test } from "bun:test"
import type { ScrollMode } from "./scrollMachine"

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void

let observerCallback: IntersectionCallback | null = null
let observedElements: unknown[] = []
let disconnected = false
let pendingIntersecting: boolean | null = null
let scrollListener: (() => void) | null = null

class MockIntersectionObserver {
  constructor(callback: IntersectionCallback, _options?: IntersectionObserverInit) {
    observerCallback = callback
    disconnected = false
  }
  observe(target: Element) {
    observedElements.push(target)
    // When re-observing, deliver pending intersection state (simulates browser behavior)
    if (pendingIntersecting !== null && observerCallback) {
      const state = pendingIntersecting
      pendingIntersecting = null
      queueMicrotask(() => observerCallback?.([{ isIntersecting: state } as IntersectionObserverEntry]))
    }
  }
  unobserve(_target: Element) { /* noop */ }
  disconnect() { disconnected = true }
}

function fireIntersection(isIntersecting: boolean) {
  if (!observerCallback) throw new Error("No observer registered")
  observerCallback([{ isIntersecting } as IntersectionObserverEntry])
}

function resetMocks() {
  observerCallback = null
  observedElements = []
  disconnected = false
  pendingIntersecting = null
  scrollListener = null
}

function mockElements() {
  const scrollEl = {
    scrollHeight: 1000,
    scrollTop: 0,
    clientHeight: 400,
    addEventListener: (_event: string, listener: () => void) => {
      scrollListener = listener
    },
    removeEventListener: (_event: string, listener: () => void) => {
      if (scrollListener === listener) scrollListener = null
    },
  } as unknown as HTMLElement
  const sentinelEl = {} as HTMLElement
  return { scrollEl, sentinelEl }
}

function fireScroll() {
  if (!scrollListener) throw new Error("No scroll listener registered")
  scrollListener()
}

const savedIO = globalThis.IntersectionObserver

describe("useScrollFollow — createScrollFollowStore", () => {
  afterEach(() => {
    resetMocks()
    globalThis.IntersectionObserver = savedIO
  })

  function setup() {
    // @ts-expect-error -- simplified mock
    globalThis.IntersectionObserver = MockIntersectionObserver
    const { scrollEl, sentinelEl } = mockElements()
    // Dynamic import to pick up the mock
    return import("./useScrollFollow").then(({ createScrollFollowStore }) => {
      const store = createScrollFollowStore(scrollEl, sentinelEl)
      return { store, scrollEl, sentinelEl }
    })
  }

  test("initial mode is anchoring", async () => {
    const { store } = await setup()
    expect(store.getSnapshot()).toBe(false) // not following
    expect(store.getMode()).toBe("anchoring" satisfies ScrollMode)
    store.destroy()
  })

  test("transitions to following after initial tail scroll", async () => {
    const { store } = await setup()
    store.handleInitialScrollDone("tail")
    expect(store.getMode()).toBe("following" satisfies ScrollMode)
    expect(store.getSnapshot()).toBe(true)
    store.destroy()
  })

  test("transitions to detached after initial block scroll", async () => {
    const { store } = await setup()
    store.handleInitialScrollDone("block")
    expect(store.getMode()).toBe("detached" satisfies ScrollMode)
    expect(store.getSnapshot()).toBe(false)
    store.destroy()
  })

  test("detaches when sentinel exits viewport from user scroll", async () => {
    const { store } = await setup()
    store.handleInitialScrollDone("tail") // → following
    fireIntersection(false) // sentinel exits
    expect(store.getMode()).toBe("detached" satisfies ScrollMode)
    store.destroy()
  })

  test("stays following when sentinel exits during programmatic scroll", async () => {
    const { store } = await setup()
    store.handleInitialScrollDone("tail") // → following
    store.beginProgrammaticScroll()
    fireIntersection(false) // sentinel exits during programmatic scroll
    expect(store.getMode()).toBe("following" satisfies ScrollMode)
    store.endProgrammaticScroll()
    store.destroy()
  })

  test("re-engages following on scrollToBottom from detached", async () => {
    const { store } = await setup()
    store.handleInitialScrollDone("tail")
    fireIntersection(false) // → detached
    expect(store.getMode()).toBe("detached")
    store.handleScrollToBottom()
    expect(store.getMode()).toBe("following" satisfies ScrollMode)
    store.destroy()
  })

  test("resets to anchoring on chat change", async () => {
    const { store } = await setup()
    store.handleInitialScrollDone("tail") // → following
    store.handleChatChanged()
    expect(store.getMode()).toBe("anchoring" satisfies ScrollMode)
    store.destroy()
  })

  test("notifies subscriber on every mode transition", async () => {
    const { store } = await setup()
    const onChange = mock(() => {})
    store.subscribe(onChange)

    // anchoring → following → notify
    store.handleInitialScrollDone("tail")
    expect(onChange).toHaveBeenCalledTimes(1)

    // following → detached → notify
    fireIntersection(false)
    expect(onChange).toHaveBeenCalledTimes(2)

    // detached + sentinel still not intersecting → same mode → no notify
    fireIntersection(false)
    expect(onChange).toHaveBeenCalledTimes(2)

    // detached → following → notify
    store.handleScrollToBottom()
    expect(onChange).toHaveBeenCalledTimes(3)

    store.destroy()
  })

  test("notifies subscriber when mode changes even if isFollowing stays the same", async () => {
    const { store } = await setup()
    const onChange = mock(() => {})
    store.subscribe(onChange)

    // anchoring → detached (block anchor) — both are !following, but mode changes
    store.handleInitialScrollDone("block")
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(store.getMode()).toBe("detached")

    store.destroy()
  })

  test("observes sentinel element on creation", async () => {
    const { sentinelEl } = await setup()
    expect(observedElements).toContain(sentinelEl)
  })

  test("disconnects observer on destroy", async () => {
    const { store } = await setup()
    store.destroy()
    expect(disconnected).toBe(true)
  })

  test("re-engages following when the user manually reaches exact bottom without a fresh intersection callback", async () => {
    const { store, scrollEl } = await setup()
    store.handleInitialScrollDone("tail")
    fireIntersection(false)
    expect(store.getMode()).toBe("detached")

    scrollEl.scrollTop = 600
    fireScroll()

    expect(store.getMode()).toBe("following")
    expect(store.getSnapshot()).toBe(true)
    store.destroy()
  })

  test("reconciles to following when sentinel is already visible after block anchor scroll", async () => {
    const { store } = await setup()
    // Sentinel is visible during anchoring (ignored by state machine)
    fireIntersection(true)
    expect(store.getMode()).toBe("anchoring")

    // Set up pending intersection for re-observe
    pendingIntersecting = true

    // Block anchor completes → detached, but sentinel is already visible
    store.handleInitialScrollDone("block")

    // After microtask (re-observe fires), should reconcile to following
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(store.getMode()).toBe("following")
    expect(store.getSnapshot()).toBe(true)
    store.destroy()
  })
})
