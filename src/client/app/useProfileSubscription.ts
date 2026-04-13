import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { ProfileSnapshot } from "../../shared/profile-types"

export function useProfileSubscription(socket: AppTransport | null): ProfileSnapshot | null {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null)
  useEffect(() => {
    if (!socket) return
    return socket.subscribe<ProfileSnapshot>({ type: "profiles" }, setSnapshot)
  }, [socket])
  return snapshot
}
