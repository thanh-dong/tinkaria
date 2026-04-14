/** Extension manifest — shared metadata declaring identity and detection probes */
export interface ExtensionManifest {
  id: string
  name: string
  icon: string
  detect: string[]
}

/** A single route declared by a server extension */
export interface ExtensionRoute {
  method: "GET" | "POST"
  path: string
  handler: (req: Request, params: Record<string, string>) => Promise<Response>
}

/** Server-side extension — declares routes scoped to a project path */
export interface ServerExtension extends ExtensionManifest {
  routes(ctx: { projectPath: string }): ExtensionRoute[]
}

/** Props passed to every client extension component */
export interface ExtensionProps {
  localPath: string
  groupKey: string
}

/** Result of filesystem probe detection */
export interface DetectionResult {
  extensionId: string
  name: string
  icon: string
  detected: boolean
}
