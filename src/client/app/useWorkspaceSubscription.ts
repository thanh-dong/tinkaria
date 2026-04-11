import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { WorkspaceCoordinationSnapshot } from "../../shared/workspace-types"

export function useWorkspaceSubscription(
  socket: AppTransport,
  workspaceId: string | null
): WorkspaceCoordinationSnapshot | null {
  const [snapshot, setSnapshot] = useState<WorkspaceCoordinationSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(null)
    if (!workspaceId) return

    return socket.subscribe<WorkspaceCoordinationSnapshot>(
      { type: "workspace", workspaceId },
      (data) => setSnapshot(data)
    )
  }, [socket, workspaceId])

  return snapshot
}
