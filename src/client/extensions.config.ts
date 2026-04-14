import { lazy } from "react"

export interface ClientExtensionEntry {
  id: string
  name: string
  icon: string
  detectPatterns: string[]
  component: ReturnType<typeof lazy>
}

export const clientExtensions: ClientExtensionEntry[] = [
  {
    id: "c3",
    name: "Architecture",
    icon: "building-2",
    detectPatterns: [".c3/"],
    component: lazy(() => import("./extensions/c3/client")),
  },
  {
    id: "agents",
    name: "Agents",
    icon: "bot",
    detectPatterns: ["CLAUDE.md", ".claude/"],
    component: lazy(() => import("./extensions/agents/client")),
  },
  {
    id: "code",
    name: "Code",
    icon: "code",
    detectPatterns: ["package.json", "Cargo.toml", "go.mod", "pyproject.toml"],
    component: lazy(() => import("./extensions/code/client")),
  },
]
