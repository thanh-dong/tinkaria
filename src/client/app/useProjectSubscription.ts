import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { ProjectCoordinationSnapshot } from "../../shared/project-agent-types"

export function useProjectSubscription(
  socket: AppTransport,
  projectId: string | null
): ProjectCoordinationSnapshot | null {
  const [snapshot, setSnapshot] = useState<ProjectCoordinationSnapshot | null>(null)

  useEffect(() => {
    if (!projectId) {
      setSnapshot(null)
      return
    }

    return socket.subscribe<ProjectCoordinationSnapshot>(
      { type: "project", projectId },
      (data) => setSnapshot(data)
    )
  }, [socket, projectId])

  return snapshot
}
