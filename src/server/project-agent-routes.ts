// src/server/project-agent-routes.ts
import { LOG_PREFIX } from "../shared/branding"
import type { ProjectAgent } from "./project-agent"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(error: string, code: number, detail?: string): Response {
  return jsonResponse({ error, code, detail }, code)
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`${LOG_PREFIX} readBody: invalid JSON — ${message}`)
    return {}
  }
}

export function createProjectAgentRouter(agent: ProjectAgent): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api\/project/, "")

    if (req.method === "GET" && path === "/sessions") {
      const projectId = url.searchParams.get("projectId") ?? ""
      return jsonResponse(agent.querySessions(projectId))
    }

    if (req.method === "GET" && path.startsWith("/sessions/")) {
      const chatId = path.replace("/sessions/", "")
      const session = agent.getSessionSummary(chatId)
      return session ? jsonResponse(session) : errorResponse("Session not found", 404)
    }

    if (req.method === "POST" && path === "/search") {
      const body = await readBody(req)
      const query = body.query as string | undefined
      if (!query) return errorResponse("Missing 'query'", 400)
      const rawLimit = body.limit
      const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10
      return jsonResponse(agent.searchWork(query, limit))
    }

    if (req.method === "GET" && path === "/tasks") {
      return jsonResponse(agent.listTasks())
    }

    if (req.method === "GET" && path.startsWith("/tasks/")) {
      const taskId = path.replace("/tasks/", "")
      const task = agent.getTask(taskId)
      return task ? jsonResponse(task) : errorResponse("Task not found", 404)
    }

    if (req.method === "POST" && path === "/claim") {
      const body = await readBody(req)
      const description = body.description as string | undefined
      const session = body.session as string | undefined
      if (!description || !session) return errorResponse("Missing 'description' or 'session'", 400)
      const branch = (body.branch as string) ?? null
      return jsonResponse(agent.claimTask(description, session, branch))
    }

    if (req.method === "POST" && path === "/complete") {
      const body = await readBody(req)
      const taskId = body.taskId as string | undefined
      if (!taskId) return errorResponse("Missing 'taskId'", 400)
      const outputs = Array.isArray(body.outputs) ? (body.outputs as string[]) : []
      const task = agent.completeTask(taskId, outputs)
      return task ? jsonResponse(task) : errorResponse("Task not found", 404)
    }

    if (req.method === "GET" && path === "/resources") {
      return jsonResponse(agent.queryResources())
    }

    if (req.method === "POST" && path === "/delegate") {
      const body = await readBody(req)
      const request = body.request as string | undefined
      const projectId = (body.projectId as string) ?? ""
      if (!request) return errorResponse("Missing 'request'", 400)
      const result = await agent.delegate(request, projectId)
      return jsonResponse(result)
    }

    return errorResponse("Not found", 404)
  }
}
