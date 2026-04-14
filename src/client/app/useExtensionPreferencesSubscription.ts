import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { ExtensionPreferencesSnapshot } from "../../shared/extension-types"

export function useExtensionPreferencesSubscription(socket: AppTransport | null): ExtensionPreferencesSnapshot | null {
  const [snapshot, setSnapshot] = useState<ExtensionPreferencesSnapshot | null>(null)
  useEffect(() => {
    if (!socket) return
    return socket.subscribe<ExtensionPreferencesSnapshot>({ type: "extension-preferences" }, setSnapshot)
  }, [socket])
  return snapshot
}
