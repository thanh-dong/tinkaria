import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { AgentConfigSnapshot } from "../../shared/agent-config-types"

export function useAgentConfigSubscription(
  socket: AppTransport,
  workspaceId: string | null
): AgentConfigSnapshot | null {
  const [snapshot, setSnapshot] = useState<AgentConfigSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(null)
    if (!workspaceId) return

    return socket.subscribe<AgentConfigSnapshot>(
      { type: "agent-config", workspaceId },
      (data) => setSnapshot(data)
    )
  }, [socket, workspaceId])

  return snapshot
}
