// src/server/project-agent-routes.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { createProjectAgentRouter } from "./project-agent-routes"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let tempDirs: string[] = []

async function createRouter() {
  const dir = await mkdtemp(path.join(tmpdir(), "pa-routes-test-"))
  tempDirs.push(dir)
  const store = new EventStore(dir)
  await store.initialize()
  const sessions = new SessionIndex()
  const search = new TranscriptSearchIndex()
  const project = await store.openProject("/tmp/test", "Test Project")
  const projectId = project.id
  const agent = new ProjectAgent({ sessions, store, search, projectId })
  const router = createProjectAgentRouter(agent)
  return { router, agent, sessions, store, search, projectId }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

describe("project-agent-routes", () => {
  test("GET /api/project/sessions returns JSON array", async () => {
    const { router, projectId } = await createRouter()
    const req = new Request(`http://localhost/api/project/sessions?projectId=${projectId}`)
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("POST /api/project/search returns results", async () => {
    const { router, search } = await createRouter()
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
    const { router, agent } = await createRouter()
    await agent.claimTask("test task", "c1", null)

    const req = new Request("http://localhost/api/project/tasks")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
  })

  test("POST /api/project/claim creates a task", async () => {
    const { router } = await createRouter()
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
    const { router, agent } = await createRouter()
    const task = await agent.claimTask("task", "c1", null)

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
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "what is going on?" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  test("returns 404 for unknown routes", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/nonexistent")
    const res = await router(req)
    expect(res.status).toBe(404)
  })

  test("returns 400 for missing required fields", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await router(req)
    expect(res.status).toBe(400)
  })
})
