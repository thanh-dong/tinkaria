import { describe, test, expect, afterEach } from "bun:test"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { WorkflowStore, WorkflowParseError } from "./workflow-store"


let tmpDirs: string[] = []

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wf-store-test-"))
  tmpDirs.push(dir)
  return dir
}

async function writeYaml(dir: string, filename: string, content: string): Promise<void> {
  await writeFile(join(dir, filename), content, "utf-8")
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tmpDirs = []
})

describe("WorkflowStore", () => {
  test("list() returns all .yaml files parsed and sorted by name", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "beta.yaml", `name: Beta\nsteps:\n  - mcp_tool: do_thing`)
    await writeYaml(dir, "alpha.yaml", `name: Alpha\nsteps:\n  - mcp_tool: do_other`)
    // non-yaml file should be ignored
    await writeFile(join(dir, "readme.txt"), "not a workflow")

    const store = new WorkflowStore(dir)
    const results = await store.list()

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe("Alpha")
    expect(results[0].id).toBe("alpha")
    expect(results[1].name).toBe("Beta")
    expect(results[1].id).toBe("beta")
  })

  test("get(id) returns specific workflow by id", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "deploy.yaml", `name: Deploy\nsteps:\n  - mcp_tool: run_deploy`)

    const store = new WorkflowStore(dir)
    const wf = await store.get("deploy")

    expect(wf).not.toBeNull()
    expect(wf!.id).toBe("deploy")
    expect(wf!.name).toBe("Deploy")
    expect(wf!.steps[0].mcp_tool).toBe("run_deploy")
  })

  test("get(id) returns null for non-existent workflow", async () => {
    const dir = await makeTmpDir()
    const store = new WorkflowStore(dir)
    const wf = await store.get("nope")
    expect(wf).toBeNull()
  })

  test("parses valid YAML with manual trigger", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "m.yaml", `name: Manual\ntrigger: manual\nsteps:\n  - mcp_tool: x`)

    const store = new WorkflowStore(dir)
    const wf = await store.get("m")
    expect(wf!.trigger).toBe("manual")
  })

  test("parses valid YAML with cron trigger", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "c.yaml", `name: Cron\ntrigger:\n  cron: "*/5 * * * *"\nsteps:\n  - mcp_tool: x`)

    const store = new WorkflowStore(dir)
    const wf = await store.get("c")
    expect(wf!.trigger).toEqual({ cron: "*/5 * * * *" })
  })

  test("parses valid YAML with on_event trigger", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "e.yaml", `name: Event\ntrigger:\n  on_event: push\nsteps:\n  - mcp_tool: x`)

    const store = new WorkflowStore(dir)
    const wf = await store.get("e")
    expect(wf!.trigger).toEqual({ on_event: "push" })
  })

  test("rejects YAML missing name", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "bad.yaml", `steps:\n  - mcp_tool: x`)

    const store = new WorkflowStore(dir)
    await expect(store.get("bad")).rejects.toBeInstanceOf(WorkflowParseError)
  })

  test("rejects YAML missing steps", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "bad.yaml", `name: Bad`)

    const store = new WorkflowStore(dir)
    await expect(store.get("bad")).rejects.toBeInstanceOf(WorkflowParseError)
  })

  test("rejects YAML with empty steps array", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "bad.yaml", `name: Bad\nsteps: []`)

    const store = new WorkflowStore(dir)
    await expect(store.get("bad")).rejects.toBeInstanceOf(WorkflowParseError)
  })

  test("rejects YAML with invalid on_failure value", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "bad.yaml", `name: Bad\nsteps:\n  - mcp_tool: x\non_failure: explode`)

    const store = new WorkflowStore(dir)
    await expect(store.get("bad")).rejects.toBeInstanceOf(WorkflowParseError)
  })

  test("applies default values: trigger=manual, target=all, on_failure=stop, params={}", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "defaults.yaml", `name: Defaults\nsteps:\n  - mcp_tool: foo`)

    const store = new WorkflowStore(dir)
    const wf = await store.get("defaults")

    expect(wf!.trigger).toBe("manual")
    expect(wf!.target).toBe("all")
    expect(wf!.on_failure).toBe("stop")
    expect(wf!.steps[0].params).toEqual({})
  })

  test("list() skips files that fail parsing and warns", async () => {
    const dir = await makeTmpDir()
    await writeYaml(dir, "good.yaml", `name: Good\nsteps:\n  - mcp_tool: x`)
    await writeYaml(dir, "bad.yaml", `steps: []`) // missing name AND empty steps

    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])) }

    const store = new WorkflowStore(dir)
    const results = await store.list()

    console.warn = origWarn

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("Good")
    expect(warnings.length).toBeGreaterThan(0)
  })
})
