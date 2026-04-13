import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { RuntimeSnapshot } from "../../shared/runtime-types"

export function useRuntimeSubscription(socket: AppTransport | null): RuntimeSnapshot | null {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null)
  useEffect(() => {
    if (!socket) return
    return socket.subscribe<RuntimeSnapshot>({ type: "runtime-status" }, setSnapshot)
  }, [socket])
  return snapshot
}
