// src/server/project-agent.test.ts
import { describe, expect, test, afterEach } from "bun:test"
import { ProjectAgent } from "./project-agent"
import { SessionIndex } from "./session-index"
import { EventStore } from "./event-store"
import { TranscriptSearchIndex } from "./transcript-search"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let tempDirs: string[] = []

async function createAgent() {
  const dir = await mkdtemp(path.join(tmpdir(), "pa-test-"))
  tempDirs.push(dir)
  const store = new EventStore(dir)
  await store.initialize()
  const sessions = new SessionIndex()
  const search = new TranscriptSearchIndex()

  const project = await store.openProject("/tmp/test", "Test Project")
  const projectId = project.id

  const agent = new ProjectAgent({ sessions, store, search, projectId })
  return { agent, sessions, store, search, projectId }
}

afterEach(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true })
  tempDirs = []
})

describe("ProjectAgent", () => {
  describe("querySessions", () => {
    test("returns sessions for project", async () => {
      const { agent, projectId } = await createAgent()
      const result = agent.querySessions(projectId)
      expect(result).toEqual([])
    })
  })

  describe("searchWork", () => {
    test("delegates to transcript search", async () => {
      const { agent, search } = await createAgent()
      search.addEntry("chat-1", {
        _id: "1",
        createdAt: Date.now(),
        kind: "user_prompt",
        content: "implement auth middleware",
      } as never)

      const results = agent.searchWork("auth middleware", 10)
      expect(results.length).toBe(1)
    })
  })

  describe("claimTask", () => {
    test("creates and claims task in event store", async () => {
      const { agent } = await createAgent()
      const task = await agent.claimTask("implement auth", "chat-1", "feat/auth")
      expect(task.status).toBe("claimed")
      expect(task.description).toBe("implement auth")
      expect(task.claimedBy).toBe("chat-1")
    })
  })

  describe("completeTask", () => {
    test("completes task", async () => {
      const { agent } = await createAgent()
      const task = await agent.claimTask("task", "chat-1", null)
      const completed = await agent.completeTask(task.id, ["file.ts"])
      expect(completed).not.toBeNull()
      expect(completed!.status).toBe("complete")
      expect(completed!.outputs).toEqual(["file.ts"])
    })
  })

  describe("listTasks", () => {
    test("returns all tasks", async () => {
      const { agent } = await createAgent()
      await agent.claimTask("a", "c1", null)
      await agent.claimTask("b", "c2", null)
      expect(agent.listTasks().length).toBe(2)
    })
  })

  describe("delegate", () => {
    test("returns task info for task query", async () => {
      const { agent } = await createAgent()
      await agent.claimTask("implement auth", "chat-1", "feat/auth")

      const result = await agent.delegate("who is working on auth?")
      expect(result.status).toBe("ok")
      expect(result.message).toContain("auth")
    })

    test("returns ok with summary when no data found", async () => {
      const { agent } = await createAgent()
      const result = await agent.delegate("what is going on?")
      expect(result.status).toBe("ok")
    })
  })
})
