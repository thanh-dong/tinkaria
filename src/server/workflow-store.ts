import { readdir, readFile } from "node:fs/promises"
import { join, basename } from "node:path"
import yaml from "js-yaml"
import type { WorkflowDefinition, WorkflowStep, WorkflowTrigger } from "../shared/workflow-types"

const LOG_PREFIX = "[workflow-store]"

export class WorkflowParseError extends Error {
  constructor(
    public readonly workflowId: string,
    public readonly field: string,
    message: string,
  ) {
    super(`[${workflowId}] ${field}: ${message}`)
    this.name = "WorkflowParseError"
  }
}

export class WorkflowStore {
  constructor(private readonly workflowsDir: string) {}

  async list(): Promise<WorkflowDefinition[]> {
    let entries: string[]
    try {
      entries = await readdir(this.workflowsDir)
    } catch (err) {
      console.warn(`${LOG_PREFIX} Cannot read workflows dir: ${err instanceof Error ? err.message : String(err)}`)
      return []
    }

    const yamlFiles = entries.filter((f) => f.endsWith(".yaml")).sort()
    const results: WorkflowDefinition[] = []

    for (const file of yamlFiles) {
      const id = basename(file, ".yaml")
      try {
        const content = await readFile(join(this.workflowsDir, file), "utf-8")
        const raw = yaml.load(content)
        results.push(this.parseYaml(id, raw))
      } catch (err) {
        console.warn(`${LOG_PREFIX} Skipping ${file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(id: string): Promise<WorkflowDefinition | null> {
    const filePath = join(this.workflowsDir, `${id}.yaml`)
    let content: string
    try {
      content = await readFile(filePath, "utf-8")
    } catch {
      return null
    }
    const raw = yaml.load(content)
    return this.parseYaml(id, raw)
  }

  private parseYaml(id: string, raw: unknown): WorkflowDefinition {
    if (typeof raw !== "object" || raw === null) {
      throw new WorkflowParseError(id, "root", "must be an object")
    }

    const obj = raw as Record<string, unknown>

    // name
    if (typeof obj.name !== "string" || obj.name.trim() === "") {
      throw new WorkflowParseError(id, "name", "must be a non-empty string")
    }

    // trigger
    let trigger: WorkflowTrigger = "manual"
    if (obj.trigger !== undefined) {
      if (obj.trigger === "manual") {
        trigger = "manual"
      } else if (typeof obj.trigger === "object" && obj.trigger !== null) {
        const t = obj.trigger as Record<string, unknown>
        if (typeof t.cron === "string") {
          trigger = { cron: t.cron }
        } else if (typeof t.on_event === "string") {
          trigger = { on_event: t.on_event }
        } else {
          throw new WorkflowParseError(id, "trigger", "must be 'manual', {cron: string}, or {on_event: string}")
        }
      } else {
        throw new WorkflowParseError(id, "trigger", "must be 'manual', {cron: string}, or {on_event: string}")
      }
    }

    // target
    let target: string = "all"
    if (obj.target !== undefined) {
      if (typeof obj.target !== "string" || obj.target.trim() === "") {
        throw new WorkflowParseError(id, "target", "must be 'all' or a non-empty string")
      }
      target = obj.target
    }

    // steps
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
      throw new WorkflowParseError(id, "steps", "must be a non-empty array")
    }

    const steps: WorkflowStep[] = obj.steps.map((s: unknown, i: number) => {
      if (typeof s !== "object" || s === null) {
        throw new WorkflowParseError(id, `steps[${i}]`, "must be an object")
      }
      const step = s as Record<string, unknown>
      if (typeof step.mcp_tool !== "string") {
        throw new WorkflowParseError(id, `steps[${i}].mcp_tool`, "must be a string")
      }
      return {
        mcp_tool: step.mcp_tool,
        params: (typeof step.params === "object" && step.params !== null ? step.params : {}) as Record<string, unknown>,
        ...(typeof step.label === "string" ? { label: step.label } : {}),
      }
    })

    // on_failure
    const validFailures = ["stop", "continue", "rollback"] as const
    let onFailure: "stop" | "continue" | "rollback" = "stop"
    if (obj.on_failure !== undefined) {
      if (!validFailures.includes(obj.on_failure as typeof validFailures[number])) {
        throw new WorkflowParseError(id, "on_failure", `must be one of: ${validFailures.join(", ")}`)
      }
      onFailure = obj.on_failure as "stop" | "continue" | "rollback"
    }

    return {
      id,
      name: obj.name,
      trigger,
      target,
      steps,
      on_failure: onFailure,
    }
  }
}
