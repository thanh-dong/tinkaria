export interface DesktopCompanionManifest {
  serverUrl: string
  appName: string
  version: string
}

export function resolveDesktopCompanionServerUrl(hostname: string, port: number) {
  const configured = process.env.TINKARIA_PUBLIC_SERVER_URL?.trim()
    || process.env.KANNA_PUBLIC_SERVER_URL?.trim()

  if (configured) {
    return configured
  }

  return `http://${hostname}:${port}`
}

export function normalizeDesktopCompanionManifest(
  value: Partial<DesktopCompanionManifest> | null | undefined
): DesktopCompanionManifest {
  return {
    serverUrl: value?.serverUrl ?? "http://127.0.0.1:5174",
    appName: value?.appName ?? "Tinkaria",
    version: value?.version ?? "unknown",
  }
}
