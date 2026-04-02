export interface DesktopCompanionManifest {
  serverUrl: string
  natsUrl: string
  natsWsUrl: string
  authToken: string
  appName: string
  version: string
}

export function normalizeDesktopCompanionManifest(
  value: Partial<DesktopCompanionManifest> | null | undefined
): DesktopCompanionManifest {
  return {
    serverUrl: value?.serverUrl ?? "http://127.0.0.1:5174",
    natsUrl: value?.natsUrl ?? "",
    natsWsUrl: value?.natsWsUrl ?? "",
    authToken: value?.authToken ?? "",
    appName: value?.appName ?? "Tinkaria",
    version: value?.version ?? "unknown",
  }
}
