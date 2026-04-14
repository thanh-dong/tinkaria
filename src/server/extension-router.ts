import { exists } from "node:fs/promises"
import path from "node:path"
import type { ServerExtension, DetectionResult } from "../shared/extension-types"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(error: string, code: number, detail?: string): Response {
  return jsonResponse({ error, code, detail }, code)
}

/** Match a route pattern (e.g. `/read/:id`) against a request path (e.g. `/read/c3-101`) */
function matchRoute(
  pattern: string,
  requestPath: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean)
  const requestParts = requestPath.split("/").filter(Boolean)

  if (patternParts.length !== requestParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pat = patternParts[i]
    const req = requestParts[i]
    if (pat.startsWith(":")) {
      params[pat.slice(1)] = req
    } else if (pat !== req) {
      return null
    }
  }
  return params
}

async function detectExtension(
  ext: ServerExtension,
  projectPath: string,
): Promise<DetectionResult> {
  let detected = false
  for (const probe of ext.detect) {
    const probePath = path.join(projectPath, probe)
    if (await exists(probePath)) {
      detected = true
      break
    }
  }
  return {
    extensionId: ext.id,
    name: ext.name,
    icon: ext.icon,
    detected,
  }
}

export function createExtensionRouter(
  extensions: ServerExtension[],
): (req: Request) => Promise<Response> {
  const extensionMap = new Map<string, ServerExtension>()
  for (const ext of extensions) {
    extensionMap.set(ext.id, ext)
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const fullPath = url.pathname.replace(/^\/api\/ext/, "")

    // GET /api/ext/detect?projectPath=...
    if (req.method === "GET" && fullPath === "/detect") {
      const projectPath = url.searchParams.get("projectPath")
      if (!projectPath) {
        return errorResponse("Missing 'projectPath' query parameter", 400)
      }

      const results = await Promise.all(
        extensions.map((ext) => detectExtension(ext, projectPath)),
      )
      return jsonResponse(results)
    }

    // Extension route dispatch: /api/ext/:extensionId/...
    const segments = fullPath.split("/").filter(Boolean)
    if (segments.length < 2) {
      return errorResponse("Not found", 404)
    }

    const extensionId = segments[0]
    const routePath = "/" + segments.slice(1).join("/")

    const projectPath = url.searchParams.get("projectPath")
    if (!projectPath) {
      return errorResponse("Missing 'projectPath' query parameter", 400)
    }

    const ext = extensionMap.get(extensionId)
    if (!ext) {
      return errorResponse(`Extension '${extensionId}' not found`, 404)
    }

    const routes = ext.routes({ projectPath })
    for (const route of routes) {
      if (route.method !== req.method) continue
      const params = matchRoute(route.path, routePath)
      if (params !== null) {
        return route.handler(req, params)
      }
    }

    return errorResponse("Not found", 404)
  }
}
