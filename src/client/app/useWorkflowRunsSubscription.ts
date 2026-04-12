import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { WorkflowRunsSnapshot } from "../../shared/workflow-types"

export function useWorkflowRunsSubscription(
  socket: AppTransport,
  workspaceId: string | null
): WorkflowRunsSnapshot | null {
  const [snapshot, setSnapshot] = useState<WorkflowRunsSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(null)
    if (!workspaceId) return

    return socket.subscribe<WorkflowRunsSnapshot>(
      { type: "workflow-runs", workspaceId },
      (data) => setSnapshot(data)
    )
  }, [socket, workspaceId])

  return snapshot
}
