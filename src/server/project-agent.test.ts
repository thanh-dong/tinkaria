// src/server/project-agent.test.ts
import { describe, expect, test } from "bun:test"
import { ProjectAgent } from "./project-agent"
import { SessionIndex } from "./session-index"
import { TaskLedger } from "./task-ledger"
import { TranscriptSearchIndex } from "./transcript-search"

function createAgent() {
  const sessions = new SessionIndex()
  const tasks = new TaskLedger()
  const search = new TranscriptSearchIndex()
  const agent = new ProjectAgent({ sessions, tasks, search })
  return { agent, sessions, tasks, search }
}

describe("ProjectAgent", () => {
  describe("querySessions", () => {
    test("returns sessions for project", () => {
      const { agent } = createAgent()
      const result = agent.querySessions("p1")
      expect(result).toEqual([])
    })
  })

  describe("searchWork", () => {
    test("delegates to transcript search", () => {
      const { agent, search } = createAgent()
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
    test("creates task in ledger", () => {
      const { agent } = createAgent()
      const task = agent.claimTask("implement auth", "chat-1", "feat/auth")
      expect(task.status).toBe("claimed")
    })
  })

  describe("completeTask", () => {
    test("completes task", () => {
      const { agent } = createAgent()
      const task = agent.claimTask("task", "chat-1", null)
      const completed = agent.completeTask(task.id, ["file.ts"])
      expect(completed).not.toBeNull()
      expect(completed!.status).toBe("complete")
    })
  })

  describe("listTasks", () => {
    test("returns all tasks", () => {
      const { agent } = createAgent()
      agent.claimTask("a", "c1", null)
      agent.claimTask("b", "c2", null)
      expect(agent.listTasks().length).toBe(2)
    })
  })

  describe("delegate", () => {
    test("returns task info for task query", async () => {
      const { agent } = createAgent()
      agent.claimTask("implement auth", "chat-1", "feat/auth")

      const result = await agent.delegate("who is working on auth?", "p1")
      expect(result.status).toBe("ok")
      expect(result.message).toContain("auth")
    })

    test("returns ok with summary when no data found", async () => {
      const { agent } = createAgent()
      const result = await agent.delegate("what is going on?", "p1")
      expect(result.status).toBe("ok")
    })
  })
})
