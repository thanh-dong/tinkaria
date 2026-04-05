import { useState, useEffect } from "react"

export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)"

export function getIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  return isMobile
}
