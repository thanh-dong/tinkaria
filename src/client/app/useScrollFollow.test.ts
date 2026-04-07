import { afterEach, describe, expect, mock, test } from "bun:test"
import type { ScrollMode } from "./scrollMachine"

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void

let observerCallback: IntersectionCallback | null = null
let observedElements: unknown[] = []
let disconnected = false

class MockIntersectionObserver {
  constructor(callback: IntersectionCallback, _options?: IntersectionObserverInit) {
    observerCallback = callback
    disconnected = false
  }
  observe(target: Element) { observedElements.push(target) }
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
}

// Mock elements — createScrollFollowStore only needs them as identity tokens
// and passes them to IntersectionObserver. No real DOM needed.
function mockElements() {
  const scrollEl = {} as HTMLElement
  const sentinelEl = {} as HTMLElement
  return { scrollEl, sentinelEl }
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

  test("notifies subscriber only when isFollowing flips", async () => {
    const { store } = await setup()
    const onChange = mock(() => {})
    store.subscribe(onChange)

    // anchoring → following (false → true) → notify
    store.handleInitialScrollDone("tail")
    expect(onChange).toHaveBeenCalledTimes(1)

    // following → detached (true → false) → notify
    fireIntersection(false)
    expect(onChange).toHaveBeenCalledTimes(2)

    // detached + sentinel still not intersecting → no flip → no notify
    fireIntersection(false)
    expect(onChange).toHaveBeenCalledTimes(2)

    // detached → following (false → true) → notify
    store.handleScrollToBottom()
    expect(onChange).toHaveBeenCalledTimes(3)

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
})
