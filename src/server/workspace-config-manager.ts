import { mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"
import yaml from "js-yaml"
import type { AgentConfig } from "../shared/agent-config-types"

const LOG_PREFIX = "[WorkspaceConfigManager]"

export class WorkspaceConfigManager {
  constructor(private basePath: string) {}

  async initWorkspaceDir(workspaceId: string): Promise<string> {
    const wsPath = this.getWorkspacePath(workspaceId)
    await mkdir(path.join(wsPath, "agents"), { recursive: true })
    await mkdir(path.join(wsPath, "workflows"), { recursive: true })
    await $`git -C ${wsPath} init`.quiet()
    await $`git -C ${wsPath} config user.email "workspace@tinkaria.local"`.quiet()
    await $`git -C ${wsPath} config user.name "Tinkaria Workspace"`.quiet()
    return wsPath
  }

  async saveAgentConfig(workspaceId: string, config: AgentConfig): Promise<void> {
    const agentDir = path.join(this.getWorkspacePath(workspaceId), "agents")
    await mkdir(agentDir, { recursive: true })
    const filePath = this.getAgentConfigPath(workspaceId, config.id)
    const content = yaml.dump(config, { sortKeys: true })
    await writeFile(filePath, content, "utf-8")
  }

  async readAgentConfig(workspaceId: string, agentId: string): Promise<AgentConfig | null> {
    const filePath = this.getAgentConfigPath(workspaceId, agentId)
    try {
      const content = await readFile(filePath, "utf-8")
      return yaml.load(content) as AgentConfig
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes("ENOENT") || error instanceof SyntaxError) {
        return null
      }
      console.warn(`${LOG_PREFIX} readAgentConfig failed: ${msg}`)
      return null
    }
  }

  async listAgentConfigs(workspaceId: string): Promise<AgentConfig[]> {
    const agentsDir = path.join(this.getWorkspacePath(workspaceId), "agents")
    const entries = await readdir(agentsDir)
    const configs: AgentConfig[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".yaml")) continue
      try {
        const content = await readFile(path.join(agentsDir, entry), "utf-8")
        const parsed = yaml.load(content) as AgentConfig
        configs.push(parsed)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`${LOG_PREFIX} skipping unparseable ${entry}: ${msg}`)
      }
    }
    return configs
  }

  async removeAgentConfig(workspaceId: string, agentId: string): Promise<void> {
    const filePath = this.getAgentConfigPath(workspaceId, agentId)
    await rm(filePath, { force: true })
  }

  async commitConfig(workspaceId: string, message: string): Promise<string> {
    const wsPath = this.getWorkspacePath(workspaceId)
    await $`git -C ${wsPath} add -A`.quiet()
    await $`git -C ${wsPath} commit -m ${message} --allow-empty`.quiet()
    const result = await $`git -C ${wsPath} rev-parse HEAD`.quiet()
    return result.text().trim()
  }

  private getWorkspacePath(workspaceId: string): string {
    return path.join(this.basePath, workspaceId)
  }

  private getAgentConfigPath(workspaceId: string, agentId: string): string {
    return path.join(this.getWorkspacePath(workspaceId), "agents", `${agentId}.yaml`)
  }
}
