import { lazy } from "react"

export interface ClientExtensionEntry {
  id: string
  name: string
  icon: string
  component: ReturnType<typeof lazy>
}

export const clientExtensions: ClientExtensionEntry[] = [
  {
    id: "c3",
    name: "Architecture",
    icon: "building-2",
    component: lazy(() => import("./extensions/c3/client")),
  },
  {
    id: "agents",
    name: "Agents",
    icon: "bot",
    component: lazy(() => import("./extensions/agents/client")),
  },
  {
    id: "code",
    name: "Code",
    icon: "code",
    component: lazy(() => import("./extensions/code/client")),
  },
]
