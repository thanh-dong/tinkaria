import { describe, test, expect, afterEach } from "bun:test"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { WorkspaceConfigManager } from "./workspace-config-manager"
import type { AgentConfig } from "../shared/agent-config-types"

const makeConfig = (id: string): AgentConfig => ({
  id,
  name: `Agent ${id}`,
  description: `Test agent ${id}`,
  provider: "claude",
  model: "opus-4",
  systemPrompt: "You are helpful.",
  tools: ["bash", "read"],
  temperature: 0.7,
})

describe("WorkspaceConfigManager", () => {
  let tmpDir: string
  let mgr: WorkspaceConfigManager

  const setup = async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "wcm-test-"))
    mgr = new WorkspaceConfigManager(tmpDir)
  }

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("initWorkspaceDir creates .git, agents/, workflows/", async () => {
    await setup()
    const wsPath = await mgr.initWorkspaceDir("ws-1")
    expect(wsPath).toBe(path.join(tmpDir, "ws-1"))
    const gitStat = await stat(path.join(wsPath, ".git"))
    expect(gitStat.isDirectory()).toBe(true)
    const agentsStat = await stat(path.join(wsPath, "agents"))
    expect(agentsStat.isDirectory()).toBe(true)
    const workflowsStat = await stat(path.join(wsPath, "workflows"))
    expect(workflowsStat.isDirectory()).toBe(true)
  })

  test("initWorkspaceDir is idempotent", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-2")
    const wsPath = await mgr.initWorkspaceDir("ws-2")
    expect(wsPath).toBe(path.join(tmpDir, "ws-2"))
  })

  test("saveAgentConfig writes agents/<id>.yaml", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-3")
    const config = makeConfig("agent-a")
    await mgr.saveAgentConfig("ws-3", config)
    const filePath = path.join(tmpDir, "ws-3", "agents", "agent-a.yaml")
    const fileStat = await stat(filePath)
    expect(fileStat.isFile()).toBe(true)
  })

  test("readAgentConfig roundtrips saved config", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-4")
    const config = makeConfig("agent-b")
    await mgr.saveAgentConfig("ws-4", config)
    const read = await mgr.readAgentConfig("ws-4", "agent-b")
    expect(read).toEqual(config)
  })

  test("readAgentConfig returns null for missing agent", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-5")
    const read = await mgr.readAgentConfig("ws-5", "nope")
    expect(read).toBeNull()
  })

  test("listAgentConfigs returns all saved, skips non-yaml", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-6")
    await mgr.saveAgentConfig("ws-6", makeConfig("x"))
    await mgr.saveAgentConfig("ws-6", makeConfig("y"))
    // write a non-yaml file that should be skipped
    await writeFile(path.join(tmpDir, "ws-6", "agents", "readme.txt"), "ignore me")
    const configs = await mgr.listAgentConfigs("ws-6")
    expect(configs).toHaveLength(2)
    const ids = configs.map((c: AgentConfig) => c.id).sort()
    expect(ids).toEqual(["x", "y"])
  })

  test("removeAgentConfig deletes the file", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-7")
    await mgr.saveAgentConfig("ws-7", makeConfig("del-me"))
    await mgr.removeAgentConfig("ws-7", "del-me")
    const configs = await mgr.listAgentConfigs("ws-7")
    expect(configs).toHaveLength(0)
  })

  test("commitConfig returns a non-empty hash", async () => {
    await setup()
    await mgr.initWorkspaceDir("ws-8")
    await mgr.saveAgentConfig("ws-8", makeConfig("committed"))
    const hash = await mgr.commitConfig("ws-8", "initial config")
    expect(typeof hash).toBe("string")
    expect(hash.length).toBeGreaterThanOrEqual(7)
  })
})
