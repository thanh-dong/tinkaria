export const FOLLOW_BAND_PX = 20

export interface ScrollDetector {
  destroy: () => void
  reobserve: () => void
}

export function createScrollDetector(opts: {
  scrollEl: HTMLElement
  sentinelEl: HTMLElement
  onIntersectionChange: (isIntersecting: boolean) => void
}): ScrollDetector {
  let destroyed = false

  const observer = new IntersectionObserver(
    (entries) => {
      if (destroyed) return
      const entry = entries[0]
      if (!entry) return
      opts.onIntersectionChange(entry.isIntersecting)
    },
    {
      root: opts.scrollEl,
      threshold: 0,
      rootMargin: `0px 0px ${FOLLOW_BAND_PX}px 0px`,
    },
  )
  observer.observe(opts.sentinelEl)

  return {
    reobserve() {
      observer.unobserve(opts.sentinelEl)
      observer.observe(opts.sentinelEl)
    },

    destroy() {
      destroyed = true
      observer.disconnect()
    },
  }
}
