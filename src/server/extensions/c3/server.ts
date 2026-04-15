import type { ServerExtension, ExtensionRoute } from "../../../shared/extension-types"
import { homedir } from "node:os"
import path from "node:path"

const LOG_PREFIX = "[c3-ext]"

interface C3ListEntity {
  id: string
  type: string
  title?: string
  name?: string
  parent?: string
  status?: string
  children?: C3ListEntity[]
  [key: string]: unknown
}

interface C3ListJsonOutput {
  entities?: C3ListEntity[]
  items?: C3ListEntity[]
  [key: string]: unknown
}

export function buildC3EntityTree(entities: C3ListEntity[]): C3ListEntity[] {
  const byId = new Map<string, C3ListEntity>()
  const roots: C3ListEntity[] = []

  for (const entity of entities) {
    const { children: _children, ...rest } = entity
    byId.set(entity.id, { ...rest })
  }

  for (const entity of entities) {
    const node = byId.get(entity.id)
    if (!node) continue

    const parentId = typeof entity.parent === "string" ? entity.parent : null
    const parent = parentId && parentId !== entity.id ? byId.get(parentId) : undefined

    if (parent) {
      parent.children = parent.children ?? []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function normalizeListData(parsed: C3ListJsonOutput): C3ListEntity[] | C3ListJsonOutput {
  if (Array.isArray(parsed.entities)) return buildC3EntityTree(parsed.entities)
  if (Array.isArray(parsed.items)) return buildC3EntityTree(parsed.items)
  return parsed
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(error: string, code: number): Response {
  return jsonResponse({ error, code }, code)
}

/** Resolve c3x path: PATH first, then known install location */
async function resolveC3xPath(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["which", "c3x"], { stdout: "pipe", stderr: "pipe" })
    const out = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    if (exitCode === 0 && out.trim()) return out.trim()
  } catch (_e: unknown) {
    // fall through
  }

  const fallback = path.join(
    homedir(),
    ".claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh",
  )
  const file = Bun.file(fallback)
  if (await file.exists()) return fallback

  return null
}

async function runC3x(
  args: string[],
  projectPath: string,
): Promise<{ stdout: string; exitCode: number }> {
  const c3xPath = await resolveC3xPath()
  if (!c3xPath) throw new Error("c3x not found")

  // If c3xPath is a shell script, run via bash; if binary, run directly
  const cmd = c3xPath.endsWith(".sh")
    ? ["bash", c3xPath, ...args]
    : [c3xPath, ...args]

  const proc = Bun.spawn(cmd, {
    cwd: projectPath,
    env: { ...process.env, C3X_MODE: "agent" },
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  return { stdout, exitCode }
}

function handleList(projectPath: string): ExtensionRoute["handler"] {
  return async (_req, _params) => {
    try {
      const { stdout, exitCode } = await runC3x(["list", "--compact", "--json"], projectPath)
      if (exitCode !== 0) {
        console.warn(LOG_PREFIX, "c3x list exited with code", exitCode)
        return errorResponse("c3x execution failed", 503)
      }
      try {
        const parsed = JSON.parse(stdout) as C3ListJsonOutput
        return jsonResponse({ data: normalizeListData(parsed) })
      } catch (_e: unknown) {
        return jsonResponse({ data: stdout.trim() })
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, "list failed:", msg)
      return errorResponse("c3x execution failed", 503)
    }
  }
}

function handleRead(projectPath: string): ExtensionRoute["handler"] {
  return async (req, _params) => {
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    if (!id) {
      return errorResponse("Missing required 'id' query parameter", 400)
    }

    try {
      const { stdout, exitCode } = await runC3x(["read", id, "--full"], projectPath)
      if (exitCode !== 0) {
        console.warn(LOG_PREFIX, "c3x read exited with code", exitCode)
        return errorResponse("c3x execution failed", 503)
      }
      try {
        const parsed = JSON.parse(stdout) as unknown
        return jsonResponse({ data: parsed })
      } catch (_error: unknown) {
        return jsonResponse({ data: stdout.trim() })
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, "read failed:", msg)
      return errorResponse("c3x execution failed", 503)
    }
  }
}

function handleGraph(projectPath: string): ExtensionRoute["handler"] {
  return async (req, _params) => {
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    if (!id) {
      return errorResponse("Missing required 'id' query parameter", 400)
    }

    try {
      const { stdout, exitCode } = await runC3x(["graph", id, "--format", "mermaid"], projectPath)
      if (exitCode !== 0) {
        console.warn(LOG_PREFIX, "c3x graph exited with code", exitCode)
        return errorResponse("c3x execution failed", 503)
      }
      return jsonResponse({ data: stdout.trim() })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(LOG_PREFIX, "graph failed:", msg)
      return errorResponse("c3x execution failed", 503)
    }
  }
}

export const c3Extension: ServerExtension = {
  id: "c3",
  name: "Architecture",
  icon: "building-2",
  detect: [".c3/"],
  routes(ctx) {
    return [
      { method: "GET", path: "/list", handler: handleList(ctx.projectPath) },
      { method: "GET", path: "/read", handler: handleRead(ctx.projectPath) },
      { method: "GET", path: "/graph", handler: handleGraph(ctx.projectPath) },
    ]
  },
}
