import { describe, expect, test, afterEach } from "bun:test"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { ProjectAgent } from "./project-agent"
import { createProjectAgentRouter } from "./project-agent-routes"
import type { TranscriptEntry } from "../shared/types"
import type { StoreState, ChatRecord } from "./events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let tempDirs: string[] = []

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
): TranscriptEntry {
  return { _id: crypto.randomUUID(), createdAt: Date.now(), ...entry } as TranscriptEntry
}

async function createIntegration() {
  const dir = await mkdtemp(path.join(tmpdir(), "pa-integration-test-"))
  tempDirs.push(dir)
  const store = new EventStore(dir)
  await store.initialize()
  const sessions = new SessionIndex()
  const search = new TranscriptSearchIndex()
  const project = await store.openProject("/tmp/test-integration", "Integration Test")
  const projectId = project.id
  const agent = new ProjectAgent({ sessions, store, search, projectId })
  const router = createProjectAgentRouter(agent)
  return { store, sessions, search, agent, router, projectId }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

function makeState(projectId: string): StoreState {
  const projectsById = new Map([[projectId, { id: projectId, localPath: "/tmp/p", title: "Test", createdAt: 0, updatedAt: 0 }]])
  const projectIdsByPath = new Map<string, string>()
  const chatsById = new Map<string, ChatRecord>([
    ["c1", {
      id: "c1", projectId, title: "Chat 1", createdAt: Date.now(), updatedAt: Date.now(),
      unread: false, provider: "claude", planMode: false, sessionToken: null, lastTurnOutcome: null,
    }],
    ["c2", {
      id: "c2", projectId, title: "Chat 2", createdAt: Date.now(), updatedAt: Date.now(),
      unread: false, provider: "codex", planMode: false, sessionToken: null, lastTurnOutcome: null,
    }],
  ])
  return { projectsById, projectIdsByPath, chatsById, coordinationByProject: new Map() }
}

describe("project agent integration", () => {
  test("end-to-end: messages → indexes → query via HTTP routes", async () => {
    const { sessions, search, router, projectId } = await createIntegration()
    const state = makeState(projectId)

    // Simulate two sessions sending messages
    const e1 = timestamped({ kind: "user_prompt", content: "implement auth middleware with JWT" })
    const e2 = timestamped({ kind: "user_prompt", content: "fix CSS styling on the sidebar component" })
    sessions.onMessageAppended("c1", e1, state)
    sessions.onMessageAppended("c2", e2, state)
    search.addEntry("c1", e1)
    search.addEntry("c2", e2)

    // Query sessions via HTTP
    const sessionsRes = await router(new Request(`http://localhost/api/project/sessions?projectId=${projectId}`))
    const sessionsBody = await sessionsRes.json() as Array<Record<string, unknown>>
    expect(sessionsRes.status).toBe(200)
    expect(sessionsBody.length).toBe(2)

    // Search transcripts via HTTP
    const searchRes = await router(new Request("http://localhost/api/project/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "auth JWT middleware", limit: 5 }),
    }))
    const searchBody = await searchRes.json() as Array<Record<string, unknown>>
    expect(searchRes.status).toBe(200)
    expect(searchBody.length).toBeGreaterThanOrEqual(1)
    expect(searchBody[0].chatId).toBe("c1")

    // Claim task via HTTP
    const claimRes = await router(new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "implement auth middleware", session: "c1", branch: "feat/auth" }),
    }))
    const claimBody = await claimRes.json() as Record<string, unknown>
    expect(claimRes.status).toBe(200)
    expect(claimBody.status).toBe("claimed")

    // List tasks via HTTP
    const tasksRes = await router(new Request("http://localhost/api/project/tasks"))
    const tasksBody = await tasksRes.json() as Array<Record<string, unknown>>
    expect(tasksBody.length).toBe(1)

    // Delegate via HTTP
    const delegateRes = await router(new Request("http://localhost/api/project/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: "who is working on auth?" }),
    }))
    const delegateBody = await delegateRes.json() as Record<string, unknown>
    expect(delegateBody.status).toBe("ok")
    expect((delegateBody.message as string).toLowerCase()).toContain("auth")
  })

  test("complete task lifecycle via HTTP", async () => {
    const { router } = await createIntegration()

    // Claim
    const claimRes = await router(new Request("http://localhost/api/project/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "setup database", session: "c1", branch: null }),
    }))
    const claimed = await claimRes.json() as Record<string, unknown>
    expect(claimed.status).toBe("claimed")

    // Complete
    const completeRes = await router(new Request("http://localhost/api/project/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: claimed.id, outputs: ["migrations/001.sql"] }),
    }))
    const completed = await completeRes.json() as Record<string, unknown>
    expect(completed.status).toBe("complete")
    expect(completed.outputs).toEqual(["migrations/001.sql"])
  })
})
