import { useState, useEffect } from "react"

export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)"

function getMatchMedia(): typeof window.matchMedia | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null
  }
  return window.matchMedia.bind(window)
}

export function getIsMobile(): boolean {
  const matchMedia = getMatchMedia()
  return matchMedia ? matchMedia(MOBILE_BREAKPOINT_QUERY).matches : false
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const matchMedia = getMatchMedia()
    if (!matchMedia) return
    const mql = matchMedia(MOBILE_BREAKPOINT_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return isMobile
}
