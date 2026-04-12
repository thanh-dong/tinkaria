import { LOG_PREFIX } from "../shared/branding"
import type { WorkflowDefinition } from "../shared/workflow-types"

export interface McpDispatcher {
  dispatch(tool: string, params: Record<string, unknown>): Promise<string>
}

export interface WorkflowEventEmitter {
  emitWorkflowStarted(runId: string, workflowId: string, workspaceId: string, targetRepoIds: string[], triggeredBy: string): Promise<void>
  emitWorkflowStepStarted(runId: string, workspaceId: string, stepIndex: number, mcpTool: string, repoId?: string): Promise<void>
  emitWorkflowStepCompleted(runId: string, workspaceId: string, stepIndex: number, output: string, repoId?: string): Promise<void>
  emitWorkflowStepFailed(runId: string, workspaceId: string, stepIndex: number, error: string, repoId?: string): Promise<void>
  emitWorkflowCompleted(runId: string, workspaceId: string): Promise<void>
  emitWorkflowFailed(runId: string, workspaceId: string, error: string, failedStep: number): Promise<void>
  emitWorkflowCancelled(runId: string, workspaceId: string): Promise<void>
}

export interface WorkflowEngineOptions {
  emitter: WorkflowEventEmitter
  dispatcher: McpDispatcher
  resolveRepos(workspaceId: string): Promise<string[]>
  onProgress?: () => void
}

export class WorkflowEngine {
  private readonly activeRuns = new Map<string, AbortController>()

  constructor(private readonly opts: WorkflowEngineOptions) {}

  /**
   * Start a workflow run. Returns the runId immediately after emitting
   * workflow_started. Step execution continues in the background.
   */
  async start(
    workflowId: string,
    workspaceId: string,
    definition: WorkflowDefinition,
    triggeredBy: string,
  ): Promise<string> {
    const runId = crypto.randomUUID()
    const controller = new AbortController()
    this.activeRuns.set(runId, controller)

    const targetRepoIds =
      definition.target === "all"
        ? await this.opts.resolveRepos(workspaceId)
        : [definition.target]

    await this.opts.emitter.emitWorkflowStarted(runId, workflowId, workspaceId, targetRepoIds, triggeredBy)
    this.opts.onProgress?.()

    // Execute steps in background
    this.executeSteps(runId, workspaceId, definition, targetRepoIds, controller).catch((err: unknown) => {
      console.warn(LOG_PREFIX, `workflow ${runId} failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`)
    })

    return runId
  }

  /**
   * Run a workflow synchronously (all steps awaited). Used in tests.
   */
  async run(
    workflowId: string,
    workspaceId: string,
    definition: WorkflowDefinition,
    triggeredBy: string,
  ): Promise<string> {
    const runId = crypto.randomUUID()
    const controller = new AbortController()
    this.activeRuns.set(runId, controller)

    const targetRepoIds =
      definition.target === "all"
        ? await this.opts.resolveRepos(workspaceId)
        : [definition.target]

    await this.opts.emitter.emitWorkflowStarted(runId, workflowId, workspaceId, targetRepoIds, triggeredBy)

    await this.executeSteps(runId, workspaceId, definition, targetRepoIds, controller)

    return runId
  }

  private async executeSteps(
    runId: string,
    workspaceId: string,
    definition: WorkflowDefinition,
    targetRepoIds: string[],
    controller: AbortController,
  ): Promise<void> {
    const repos = targetRepoIds.length > 0 ? targetRepoIds : [undefined]

    try {
      for (let stepIdx = 0; stepIdx < definition.steps.length; stepIdx++) {
        if (controller.signal.aborted) break

        const step = definition.steps[stepIdx]

        for (const repoId of repos) {
          if (controller.signal.aborted) break

          await this.opts.emitter.emitWorkflowStepStarted(runId, workspaceId, stepIdx, step.mcp_tool, repoId)
          this.opts.onProgress?.()

          try {
            const params: Record<string, unknown> = { ...step.params, ...(repoId ? { repoId } : {}) }
            const output = await this.opts.dispatcher.dispatch(step.mcp_tool, params)
            await this.opts.emitter.emitWorkflowStepCompleted(runId, workspaceId, stepIdx, output, repoId)
            this.opts.onProgress?.()
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            await this.opts.emitter.emitWorkflowStepFailed(runId, workspaceId, stepIdx, errorMsg, repoId)
            this.opts.onProgress?.()

            if (definition.on_failure === "stop") {
              await this.opts.emitter.emitWorkflowFailed(runId, workspaceId, errorMsg, stepIdx)
              this.opts.onProgress?.()
              return
            }

            if (definition.on_failure === "rollback") {
              for (let rb = stepIdx - 1; rb >= 0; rb--) {
                const rbStep = definition.steps[rb]
                for (const rbRepo of repos) {
                  const rbParams: Record<string, unknown> = {
                    ...rbStep.params,
                    ...(rbRepo ? { repoId: rbRepo } : {}),
                    _rollback: true,
                  }
                  try {
                    await this.opts.dispatcher.dispatch(rbStep.mcp_tool, rbParams)
                  } catch {
                    // Best-effort rollback — ignore errors
                  }
                }
              }
              await this.opts.emitter.emitWorkflowFailed(runId, workspaceId, errorMsg, stepIdx)
              this.opts.onProgress?.()
              return
            }

            // on_failure === "continue": proceed
          }
        }
      }

      if (!controller.signal.aborted) {
        await this.opts.emitter.emitWorkflowCompleted(runId, workspaceId)
        this.opts.onProgress?.()
      }
    } finally {
      this.activeRuns.delete(runId)
    }
  }

  async cancel(runId: string, workspaceId: string): Promise<void> {
    const controller = this.activeRuns.get(runId)
    if (!controller) return
    controller.abort()
    this.activeRuns.delete(runId)
    await this.opts.emitter.emitWorkflowCancelled(runId, workspaceId)
    this.opts.onProgress?.()
  }

  isRunning(runId: string): boolean {
    return this.activeRuns.has(runId)
  }
}
