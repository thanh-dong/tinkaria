import { afterEach, describe, expect, mock, test } from "bun:test"

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void

let observerCallback: IntersectionCallback | null = null
let observerOptions: IntersectionObserverInit | undefined
let observedElements: unknown[] = []
let disconnected = false

class MockIntersectionObserver {
  constructor(callback: IntersectionCallback, options?: IntersectionObserverInit) {
    observerCallback = callback
    observerOptions = options
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
  observerOptions = undefined
  observedElements = []
  disconnected = false
}

const savedIO = globalThis.IntersectionObserver

describe("scrollDetection — createScrollDetector", () => {
  afterEach(() => {
    resetMocks()
    globalThis.IntersectionObserver = savedIO
  })

  function setup() {
    // @ts-expect-error -- simplified mock
    globalThis.IntersectionObserver = MockIntersectionObserver
    const scrollEl = {} as HTMLElement
    const sentinelEl = {} as HTMLElement
    return import("./scrollDetection").then(({ createScrollDetector, FOLLOW_BAND_PX }) => {
      const onIntersectionChange = mock((_isIntersecting: boolean) => {})
      const detector = createScrollDetector({ scrollEl, sentinelEl, onIntersectionChange })
      return { detector, scrollEl, sentinelEl, onIntersectionChange, FOLLOW_BAND_PX }
    })
  }

  test("creates IO with rootMargin for follow band", async () => {
    const { FOLLOW_BAND_PX } = await setup()
    expect(observerOptions?.rootMargin).toBe(`0px 0px ${FOLLOW_BAND_PX}px 0px`)
  })

  test("observes sentinel element on creation", async () => {
    const { sentinelEl } = await setup()
    expect(observedElements).toContain(sentinelEl)
  })

  test("fires callback when intersection changes", async () => {
    const { onIntersectionChange } = await setup()

    fireIntersection(true)
    expect(onIntersectionChange).toHaveBeenCalledTimes(1)
    expect(onIntersectionChange).toHaveBeenLastCalledWith(true)

    fireIntersection(false)
    expect(onIntersectionChange).toHaveBeenCalledTimes(2)
    expect(onIntersectionChange).toHaveBeenLastCalledWith(false)
  })

  test("reobserve unobserves then re-observes sentinel", async () => {
    const { detector, sentinelEl } = await setup()
    const countBefore = observedElements.length
    detector.reobserve()
    expect(observedElements.length).toBe(countBefore + 1)
    expect(observedElements[observedElements.length - 1]).toBe(sentinelEl)
  })

  test("destroy disconnects observer", async () => {
    const { detector } = await setup()
    detector.destroy()
    expect(disconnected).toBe(true)
  })

  test("ignores entries after destroy", async () => {
    const { detector, onIntersectionChange } = await setup()
    detector.destroy()
    // Fire after destroy — should not callback
    fireIntersection(true)
    expect(onIntersectionChange).toHaveBeenCalledTimes(0)
  })
})
