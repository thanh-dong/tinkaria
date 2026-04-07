import { useState, useEffect } from "react"

function getStandaloneMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null
  }

  return window.matchMedia("(display-mode: standalone)")
}

export function useIsStandalone() {
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === "undefined") return false
    const isIOSStandalone = (navigator as any).standalone === true
    const isDisplayStandalone = getStandaloneMediaQuery()?.matches === true
    return isIOSStandalone || isDisplayStandalone
  })

  useEffect(() => {
    const mediaQuery = getStandaloneMediaQuery()
    if (!mediaQuery) {
      setIsStandalone((navigator as any).standalone === true)
      return
    }

    const handleChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches || (navigator as any).standalone === true)
    }
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  return isStandalone
}
