import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { RepoSummary } from "../../shared/types"

export interface RepoListSnapshot {
  workspaceId: string
  repos: RepoSummary[]
}

export function useRepoSubscription(
  socket: AppTransport,
  workspaceId: string | null
): RepoListSnapshot | null {
  const [snapshot, setSnapshot] = useState<RepoListSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(null)
    if (!workspaceId) return

    return socket.subscribe<RepoListSnapshot>(
      { type: "repos", workspaceId },
      (data) => setSnapshot(data)
    )
  }, [socket, workspaceId])

  return snapshot
}
