import type { WorkspaceConfigManager } from "./workspace-config-manager"
import type { EventStore } from "./event-store"
import type { AgentConfig } from "../shared/agent-config-types"

const LOG_PREFIX = "[WorkspaceDirectoryPolicy]"

export class WorkspaceDirectoryPolicy {
  constructor(
    private store: EventStore,
    private configManager: WorkspaceConfigManager,
    private onStateChange?: () => void,
  ) {}

  /** Called after workspace_opened — creates physical workspace directory + git init */
  async onWorkspaceOpened(workspaceId: string): Promise<void> {
    try {
      await this.configManager.initWorkspaceDir(workspaceId)
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} Failed to init workspace dir:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  /** Called after agent_config_saved — writes YAML to disk + git commit, then records commit hash */
  async onAgentConfigSaved(workspaceId: string, agentId: string, config: AgentConfig): Promise<void> {
    try {
      await this.configManager.saveAgentConfig(workspaceId, config)
      const commitHash = await this.configManager.commitConfig(
        workspaceId,
        `Save agent config: ${config.name}`,
      )
      await this.store.commitAgentConfig(workspaceId, agentId, commitHash)
      this.onStateChange?.()
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} Failed to commit agent config:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  /** Called after agent_config_removed — deletes YAML from disk + git commit */
  async onAgentConfigRemoved(workspaceId: string, agentId: string): Promise<void> {
    try {
      await this.configManager.removeAgentConfig(workspaceId, agentId)
      await this.configManager.commitConfig(workspaceId, `Remove agent config: ${agentId}`)
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} Failed to remove agent config from disk:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}
