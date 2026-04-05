// src/server/project-agent-routes.test.ts
import { describe, expect, test } from "bun:test"
import { createProjectAgentRouter } from "./project-agent-routes"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"

function createRouter() {
  const sessions = new SessionIndex()
  const tasks = new TaskLedger()
  const search = new TranscriptSearchIndex()
  const agent = new ProjectAgent({ sessions, tasks, search })
  const router = createProjectAgentRouter(agent)
  return { router, agent, sessions, tasks, search }
}

describe("project-agent-routes", () => {
  test("GET /api/project/sessions returns JSON array", async () => {
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/sessions?projectId=p1")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("POST /api/project/search returns results", async () => {
    const { router, search } = createRouter()
    search.addEntry("c1", { _id: "1", createdAt: Date.now(), kind: "user_prompt", content: "auth setup" } as never)

    const req = new Request("http://localhost/api/project/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "auth", limit: 10 }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("GET /api/project/tasks returns task list", async () => {
    const { router, agent } = createRouter()
    agent.claimTask("test task", "c1", null)

    const req = new Request("http://localhost/api/project/tasks")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
  })

  test("POST /api/project/claim creates a task", async () => {
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "implement auth", session: "c1", branch: "feat/auth" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("claimed")
  })

  test("POST /api/project/complete marks task done", async () => {
    const { router, agent } = createRouter()
    const task = agent.claimTask("task", "c1", null)

    const req = new Request("http://localhost/api/project/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, outputs: ["file.ts"] }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("complete")
  })

  test("POST /api/project/delegate returns delegation result", async () => {
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "what is going on?", projectId: "p1" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  test("returns 404 for unknown routes", async () => {
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/nonexistent")
    const res = await router(req)
    expect(res.status).toBe(404)
  })

  test("returns 400 for missing required fields", async () => {
    const { router } = createRouter()
    const req = new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await router(req)
    expect(res.status).toBe(400)
  })
})
