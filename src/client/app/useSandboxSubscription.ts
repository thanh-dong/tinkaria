import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { SandboxSnapshot } from "../../shared/sandbox-types"

export function useSandboxSubscription(
  socket: AppTransport,
  workspaceId: string | null
): SandboxSnapshot | null {
  const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(null)
    if (!workspaceId) return

    return socket.subscribe<SandboxSnapshot>(
      { type: "sandbox-status", workspaceId },
      (data) => setSnapshot(data)
    )
  }, [socket, workspaceId])

  return snapshot
}
