import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventStore } from "./event-store"
import { WorkspaceConfigManager } from "./workspace-config-manager"
import { WorkspaceDirectoryPolicy } from "./workspace-directory-policy"
import type { AgentConfig } from "../shared/agent-config-types"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const makeConfig = (id: string): AgentConfig => ({
  id,
  name: `Agent ${id}`,
  description: `Test agent ${id}`,
  provider: "claude",
  model: "opus-4",
})

describe("WorkspaceDirectoryPolicy", () => {
  test("onWorkspaceOpened creates workspace dir", async () => {
    const storeDir = await createTempDir("wdp-store-")
    const wsBase = await createTempDir("wdp-ws-")
    const store = new EventStore(storeDir)
    await store.initialize()
    const mgr = new WorkspaceConfigManager(wsBase)
    const policy = new WorkspaceDirectoryPolicy(store, mgr)

    await policy.onWorkspaceOpened("ws-test")

    const gitStat = await stat(join(wsBase, "ws-test", ".git"))
    expect(gitStat.isDirectory()).toBe(true)
    const agentsStat = await stat(join(wsBase, "ws-test", "agents"))
    expect(agentsStat.isDirectory()).toBe(true)
  })

  test("onAgentConfigSaved writes YAML and records commit hash", async () => {
    const storeDir = await createTempDir("wdp-store-")
    const wsBase = await createTempDir("wdp-ws-")
    const store = new EventStore(storeDir)
    await store.initialize()
    const workspace = await store.openProject("/tmp/wdp-project")
    const mgr = new WorkspaceConfigManager(wsBase)
    const policy = new WorkspaceDirectoryPolicy(store, mgr)

    // Init the workspace dir first
    await mgr.initWorkspaceDir(workspace.id)

    // Save a config via EventStore so the record exists for commitAgentConfig
    await store.saveAgentConfig(workspace.id, "agent-1", makeConfig("agent-1"))

    // Now run the policy
    await policy.onAgentConfigSaved(workspace.id, "agent-1", makeConfig("agent-1"))

    // YAML file should exist
    const yamlStat = await stat(join(wsBase, workspace.id, "agents", "agent-1.yaml"))
    expect(yamlStat.isFile()).toBe(true)

    // Commit hash should be recorded in EventStore
    const record = store.state.agentConfigsByWorkspace.get(workspace.id)?.get("agent-1")
    expect(record).toBeDefined()
    expect(record!.lastCommitHash).toBeDefined()
    expect(typeof record!.lastCommitHash).toBe("string")
    expect(record!.lastCommitHash!.length).toBeGreaterThanOrEqual(7)
  })

  test("onAgentConfigRemoved deletes YAML from disk", async () => {
    const storeDir = await createTempDir("wdp-store-")
    const wsBase = await createTempDir("wdp-ws-")
    const store = new EventStore(storeDir)
    await store.initialize()
    const mgr = new WorkspaceConfigManager(wsBase)
    const policy = new WorkspaceDirectoryPolicy(store, mgr)

    // Setup: init dir, write a config
    await mgr.initWorkspaceDir("ws-rm")
    await mgr.saveAgentConfig("ws-rm", makeConfig("agent-del"))
    await mgr.commitConfig("ws-rm", "setup")

    // Verify file exists
    const yamlPath = join(wsBase, "ws-rm", "agents", "agent-del.yaml")
    const before = await stat(yamlPath)
    expect(before.isFile()).toBe(true)

    // Remove via policy
    await policy.onAgentConfigRemoved("ws-rm", "agent-del")

    // File should be gone
    let exists = true
    try {
      await stat(yamlPath)
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        exists = false
      }
    }
    expect(exists).toBe(false)
  })
})
