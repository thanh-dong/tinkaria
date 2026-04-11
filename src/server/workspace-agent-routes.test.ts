// src/server/project-agent-routes.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { createWorkspaceAgentRouter } from "./workspace-agent-routes"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { WorkspaceAgent } from "./workspace-agent"
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
  const workspaceId = project.id
  const agent = new WorkspaceAgent({ sessions, store, search, workspaceId })
  const router = createWorkspaceAgentRouter(agent)
  return { router, agent, sessions, store, search, workspaceId }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

describe("project-agent-routes", () => {
  test("GET /api/workspace/sessions returns JSON array", async () => {
    const { router, workspaceId } = await createRouter()
    const req = new Request(`http://localhost/api/workspace/sessions?workspaceId=${workspaceId}`)
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("POST /api/workspace/search returns results", async () => {
    const { router, search } = await createRouter()
    search.addEntry("c1", { _id: "1", createdAt: Date.now(), kind: "user_prompt", content: "auth setup" } as never)

    const req = new Request("http://localhost/api/workspace/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "auth", limit: 10 }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("GET /api/workspace/tasks returns task list", async () => {
    const { router, agent } = await createRouter()
    await agent.claimTask("test task", "c1", null)

    const req = new Request("http://localhost/api/workspace/tasks")
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
  })

  test("POST /api/workspace/claim creates a task", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/workspace/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "implement auth", session: "c1", branch: "feat/auth" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("claimed")
  })

  test("POST /api/workspace/complete marks task done", async () => {
    const { router, agent } = await createRouter()
    const task = await agent.claimTask("task", "c1", null)

    const req = new Request("http://localhost/api/workspace/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, outputs: ["file.ts"] }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("complete")
  })

  test("POST /api/workspace/delegate returns delegation result", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/workspace/delegate", {
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
    const req = new Request("http://localhost/api/workspace/nonexistent")
    const res = await router(req)
    expect(res.status).toBe(404)
  })

  test("returns 400 for missing required fields", async () => {
    const { router } = await createRouter()
    const req = new Request("http://localhost/api/workspace/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await router(req)
    expect(res.status).toBe(400)
  })
})
