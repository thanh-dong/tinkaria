import { describe, test, expect, afterEach } from "bun:test"
import type { WorkflowDefinition } from "../shared/workflow-types"
import { WorkflowEngine, type McpDispatcher, type WorkflowEventEmitter } from "./workflow-engine"

function makeDef(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    id: "test-workflow",
    name: "Test Workflow",
    trigger: "manual",
    target: "all",
    steps: [
      { mcp_tool: "tool_a", params: { key: "val" } },
      { mcp_tool: "tool_b", params: {} },
    ],
    on_failure: "stop",
    ...overrides,
  }
}

function makeEmitter(): WorkflowEventEmitter & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const handler = (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args })
    }
  return {
    calls,
    emitWorkflowStarted: handler("emitWorkflowStarted") as WorkflowEventEmitter["emitWorkflowStarted"],
    emitWorkflowStepStarted: handler("emitWorkflowStepStarted") as WorkflowEventEmitter["emitWorkflowStepStarted"],
    emitWorkflowStepCompleted: handler("emitWorkflowStepCompleted") as WorkflowEventEmitter["emitWorkflowStepCompleted"],
    emitWorkflowStepFailed: handler("emitWorkflowStepFailed") as WorkflowEventEmitter["emitWorkflowStepFailed"],
    emitWorkflowCompleted: handler("emitWorkflowCompleted") as WorkflowEventEmitter["emitWorkflowCompleted"],
    emitWorkflowFailed: handler("emitWorkflowFailed") as WorkflowEventEmitter["emitWorkflowFailed"],
    emitWorkflowCancelled: handler("emitWorkflowCancelled") as WorkflowEventEmitter["emitWorkflowCancelled"],
  }
}

function makeDispatcher(fn?: (tool: string, params: Record<string, unknown>) => Promise<string>): McpDispatcher {
  return {
    dispatch: fn ?? (async () => "ok"),
  }
}

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine

  afterEach(() => {
    engine = undefined as unknown as WorkflowEngine
  })

  test("successful 2-step run emits correct event sequence", async () => {
    const emitter = makeEmitter()
    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(),
      resolveRepos: async () => ["repo-1"],
    })

    const runId = await engine.run("wf-1", "ws-1", makeDef(), "user-1")

    expect(typeof runId).toBe("string")
    expect(runId.length).toBeGreaterThan(0)

    const methods = emitter.calls.map((c: { method: string; args: unknown[] }) => c.method)
    expect(methods).toEqual([
      "emitWorkflowStarted",
      "emitWorkflowStepStarted",
      "emitWorkflowStepCompleted",
      "emitWorkflowStepStarted",
      "emitWorkflowStepCompleted",
      "emitWorkflowCompleted",
    ])
  })

  test("on_failure: stop — halts on first failure", async () => {
    const emitter = makeEmitter()
    const dispatched: string[] = []
    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async (tool) => {
        dispatched.push(tool)
        if (tool === "tool_b") throw new Error("boom")
        return "ok"
      }),
      resolveRepos: async () => ["repo-1"],
    })

    await engine.run("wf-1", "ws-1", makeDef({ on_failure: "stop" }), "user-1")

    const methods = emitter.calls.map((c: { method: string; args: unknown[] }) => c.method)
    expect(methods).toContain("emitWorkflowStepFailed")
    expect(methods).toContain("emitWorkflowFailed")
    expect(methods).not.toContain("emitWorkflowCompleted")
    // tool_b was attempted but failed; no further steps
    expect(dispatched).toEqual(["tool_a", "tool_b"])
  })

  test("on_failure: continue — proceeds after failure", async () => {
    const emitter = makeEmitter()
    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async (tool) => {
        if (tool === "tool_a") throw new Error("fail-a")
        return "ok"
      }),
      resolveRepos: async () => ["repo-1"],
    })

    await engine.run("wf-1", "ws-1", makeDef({ on_failure: "continue" }), "user-1")

    const methods = emitter.calls.map((c: { method: string; args: unknown[] }) => c.method)
    expect(methods).toContain("emitWorkflowStepFailed")
    expect(methods).toContain("emitWorkflowStepCompleted")
    expect(methods).toContain("emitWorkflowCompleted")
    expect(methods).not.toContain("emitWorkflowFailed")
  })

  test("on_failure: rollback — re-dispatches previous steps with _rollback", async () => {
    const emitter = makeEmitter()
    const dispatched: Array<{ tool: string; params: Record<string, unknown> }> = []
    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async (tool, params) => {
        dispatched.push({ tool, params })
        if (tool === "tool_b" && !params._rollback) throw new Error("fail-b")
        return "ok"
      }),
      resolveRepos: async () => ["repo-1"],
    })

    await engine.run("wf-1", "ws-1", makeDef({ on_failure: "rollback" }), "user-1")

    // After tool_b fails, tool_a should be re-dispatched with _rollback: true
    const rollbackCalls = dispatched.filter((d) => d.params._rollback === true)
    expect(rollbackCalls.length).toBe(1)
    expect(rollbackCalls[0].tool).toBe("tool_a")

    const methods = emitter.calls.map((c: { method: string; args: unknown[] }) => c.method)
    expect(methods).toContain("emitWorkflowStepFailed")
    expect(methods).toContain("emitWorkflowFailed")
    expect(methods).not.toContain("emitWorkflowCompleted")
  })

  test("cancel() aborts a running workflow", async () => {
    const emitter = makeEmitter()
    let resolveStep: (() => void) | undefined
    const stepPromise = new Promise<void>((r) => {
      resolveStep = r
    })

    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async (tool) => {
        if (tool === "tool_a") {
          await stepPromise
        }
        return "ok"
      }),
      resolveRepos: async () => ["repo-1"],
    })

    const def = makeDef()
    const runPromise = engine.run("wf-1", "ws-1", def, "user-1")

    // Wait for step_started to be emitted
    await new Promise((r) => setTimeout(r, 10))

    expect(engine.isRunning(runPromise as unknown as string)).toBe(false) // runId not returned yet
    // Cancel using the emitted runId
    const startedCall = emitter.calls.find((c: { method: string; args: unknown[] }) => c.method === "emitWorkflowStarted")
    expect(startedCall).toBeDefined()
    const runId = startedCall!.args[0] as string

    expect(engine.isRunning(runId)).toBe(true)
    await engine.cancel(runId, "ws-1")

    // Unblock the step so the run can finish
    resolveStep!()
    await runPromise

    const methods = emitter.calls.map((c: { method: string; args: unknown[] }) => c.method)
    expect(methods).toContain("emitWorkflowCancelled")
  })

  test("target: all — dispatches each step per repo", async () => {
    const emitter = makeEmitter()
    const dispatched: Array<{ tool: string; params: Record<string, unknown> }> = []
    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async (tool, params) => {
        dispatched.push({ tool, params })
        return "ok"
      }),
      resolveRepos: async () => ["repo-1", "repo-2"],
    })

    await engine.run("wf-1", "ws-1", makeDef({ target: "all" }), "user-1")

    // Each step dispatched once per repo
    const toolACalls = dispatched.filter((d) => d.tool === "tool_a")
    expect(toolACalls.length).toBe(2)
    expect(toolACalls.map((c) => c.params.repoId)).toEqual(["repo-1", "repo-2"])

    // Events include repoId
    const stepStarted = emitter.calls.filter((c: { method: string; args: unknown[] }) => c.method === "emitWorkflowStepStarted")
    expect(stepStarted.length).toBe(4) // 2 steps × 2 repos
  })

  test("target: specific repoId — dispatches with that single repoId", async () => {
    const emitter = makeEmitter()
    const dispatched: Array<{ tool: string; params: Record<string, unknown> }> = []
    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async (tool, params) => {
        dispatched.push({ tool, params })
        return "ok"
      }),
      resolveRepos: async () => {
        throw new Error("should not be called")
      },
    })

    await engine.run("wf-1", "ws-1", makeDef({ target: "my-repo" }), "user-1")

    expect(dispatched.every((d) => d.params.repoId === "my-repo")).toBe(true)
    expect(dispatched.length).toBe(2)
  })

  test("isRunning() returns true during run, false after", async () => {
    const emitter = makeEmitter()
    let capturedRunning = false

    engine = new WorkflowEngine({
      emitter,
      dispatcher: makeDispatcher(async () => {
        // Check isRunning mid-execution
        const startCall = emitter.calls.find((c: { method: string; args: unknown[] }) => c.method === "emitWorkflowStarted")
        if (startCall) {
          capturedRunning = engine.isRunning(startCall.args[0] as string)
        }
        return "ok"
      }),
      resolveRepos: async () => ["repo-1"],
    })

    const runId = await engine.run("wf-1", "ws-1", makeDef(), "user-1")

    expect(capturedRunning).toBe(true)
    expect(engine.isRunning(runId)).toBe(false)
  })
})
