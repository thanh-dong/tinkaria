import { useEffect, useRef, useState } from "react"
import { shouldRefreshStaleSessionOnResume, getResumeRefreshSessionProjectIds } from "./appState.helpers"
import type { AppTransport, SocketStatus } from "./socket-interface"

const RESUME_REFRESH_DEDUP_WINDOW_MS = 1_000

function isStandalonePwaDisplay(): boolean {
  if (typeof window === "undefined") return false

  const isIOSStandalone = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true
  const isDisplayStandalone = window.matchMedia("(display-mode: standalone)").matches
  return isIOSStandalone || isDisplayStandalone
}

export function usePwaResume(args: {
  socket: AppTransport
  activeChatId: string | null
  connectionStatus: SocketStatus
  openSessionProjectIds: Iterable<string>
  setNormalizedCommandError: (error: unknown) => void
}): {
  resumeRefreshNonce: number
} {
  const { socket, activeChatId, connectionStatus, openSessionProjectIds, setNormalizedCommandError } = args

  const backgroundedAtRef = useRef<number | null>(null)
  const lastResumeRefreshAtRef = useRef(0)
  const [resumeRefreshNonce, setResumeRefreshNonce] = useState(0)

  useEffect(() => {
    function maybeRefreshAfterResume(trigger: "focus" | "online" | "pageshow" | "visibilitychange") {
      const resumedAt = Date.now()
      if (!shouldRefreshStaleSessionOnResume({
        isStandalone: isStandalonePwaDisplay(),
        hiddenAt: backgroundedAtRef.current,
        resumedAt,
        connectionStatus,
      })) return

      if (resumedAt - lastResumeRefreshAtRef.current < RESUME_REFRESH_DEDUP_WINDOW_MS) return
      lastResumeRefreshAtRef.current = resumedAt
      backgroundedAtRef.current = null

      console.info("[useAppState] refreshing stale session after app resume", {
        trigger,
        activeChatId,
        connectionStatus,
      })
      void socket.ensureHealthyConnection()
      setResumeRefreshNonce((current) => current + 1)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        backgroundedAtRef.current = Date.now()
        return
      }

      if (document.visibilityState === "visible") {
        maybeRefreshAfterResume("visibilitychange")
      }
    }

    function handleWindowFocus() {
      maybeRefreshAfterResume("focus")
    }

    function handleWindowOnline() {
      maybeRefreshAfterResume("online")
    }

    function handlePageShow() {
      maybeRefreshAfterResume("pageshow")
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("online", handleWindowOnline)
    window.addEventListener("pageshow", handlePageShow)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("online", handleWindowOnline)
      window.removeEventListener("pageshow", handlePageShow)
    }
  }, [activeChatId, connectionStatus, socket])

  useEffect(() => {
    if (resumeRefreshNonce === 0) return

    for (const workspaceId of getResumeRefreshSessionProjectIds(openSessionProjectIds)) {
      void socket.command({ type: "sessions.refresh", workspaceId }).catch((error) => {
        setNormalizedCommandError(error)
      })
    }
  }, [resumeRefreshNonce, setNormalizedCommandError, socket])

  return { resumeRefreshNonce }
}
