import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { CurrentSessionSnapshot, CurrentRepoStatusSnapshot } from "../../shared/types"

export function useSessionPolling(args: {
  socket: AppTransport
  activeChatId: string | null
  sessionProvider: string | null | undefined
  sessionToken: string | null | undefined
  isProcessing: boolean
  resumeRefreshNonce: number
}): {
  currentSessionRuntime: CurrentSessionSnapshot["runtime"]
  currentRepoStatus: CurrentRepoStatusSnapshot | null
} {
  const { socket, activeChatId, sessionProvider, sessionToken, isProcessing, resumeRefreshNonce } = args

  const [currentSessionRuntime, setCurrentSessionRuntime] = useState<CurrentSessionSnapshot["runtime"]>(null)
  const [currentRepoStatus, setCurrentRepoStatus] = useState<CurrentRepoStatusSnapshot | null>(null)

  useEffect(() => {
    const provider = sessionProvider
    const sToken = sessionToken
    if (!activeChatId || !provider || !sToken) {
      setCurrentSessionRuntime(null)
      return
    }

    const chatId = activeChatId
    let cancelled = false

    async function refreshCurrentSessionRuntime() {
      try {
        const result = await socket.command<CurrentSessionSnapshot>({
          type: "chat.getSessionRuntime",
          chatId,
        })
        if (!cancelled) {
          setCurrentSessionRuntime(result.runtime)
        }
      } catch {
        if (!cancelled) {
          setCurrentSessionRuntime(null)
        }
      }
    }

    void refreshCurrentSessionRuntime()

    if (!isProcessing) {
      return () => {
        cancelled = true
      }
    }

    const interval = window.setInterval(() => {
      void refreshCurrentSessionRuntime()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeChatId, sessionProvider, sessionToken, isProcessing, resumeRefreshNonce, socket])

  useEffect(() => {
    if (!activeChatId) {
      setCurrentRepoStatus(null)
      return
    }

    const chatId = activeChatId
    let cancelled = false

    async function refreshCurrentRepoStatus() {
      try {
        const result = await socket.command<{ repoStatus: CurrentRepoStatusSnapshot | null }>({
          type: "chat.getRepoStatus",
          chatId,
        })
        if (!cancelled) {
          setCurrentRepoStatus(result.repoStatus)
        }
      } catch {
        if (!cancelled) {
          setCurrentRepoStatus(null)
        }
      }
    }

    void refreshCurrentRepoStatus()

    if (!isProcessing) {
      return () => {
        cancelled = true
      }
    }

    const interval = window.setInterval(() => {
      void refreshCurrentRepoStatus()
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeChatId, isProcessing, resumeRefreshNonce, socket])

  return { currentSessionRuntime, currentRepoStatus }
}
