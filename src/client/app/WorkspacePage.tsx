import { useCallback, useMemo, useState } from "react"
import { useOutletContext, useParams } from "react-router-dom"
import { Bot, FolderGit2, Zap, Box } from "lucide-react"
import type { AgentConfig } from "../../shared/agent-config-types"
import { useAgentConfigSubscription } from "./useAgentConfigSubscription"
import { useRepoSubscription } from "./useRepoSubscription"
import { useWorkflowRunsSubscription } from "./useWorkflowRunsSubscription"
import { useSandboxSubscription } from "./useSandboxSubscription"
import { PageHeader } from "./PageHeader"
import { AgentConfigPanel } from "../components/coordination/AgentConfigPanel"
import { RepoPanel } from "../components/coordination/RepoPanel"
import { WorkflowPanel } from "../components/coordination/WorkflowPanel"
import { SandboxPanel } from "../components/coordination/SandboxPanel"
import { SegmentedControl, type SegmentedOption } from "../components/ui/segmented-control"
import type { AppState } from "./useAppState"
import { toastCommand } from "../lib/toast"

type WorkspaceTab = "agents" | "repos" | "workflows" | "sandbox"

const TAB_OPTIONS: SegmentedOption<WorkspaceTab>[] = [
  { value: "agents", label: "Agents", icon: Bot, tooltip: "Agents" },
  { value: "repos", label: "Repos", icon: FolderGit2, tooltip: "Repos" },
  { value: "workflows", label: "Workflows", icon: Zap, tooltip: "Workflows" },
  { value: "sandbox", label: "Sandbox", icon: Box, tooltip: "Sandbox" },
]

export function WorkspacePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const state = useOutletContext<AppState>()
  const agentSnap = useAgentConfigSubscription(state.socket, workspaceId ?? null)
  const repoSnap = useRepoSubscription(state.socket, workspaceId ?? null)
  const workflowSnap = useWorkflowRunsSubscription(state.socket, workspaceId ?? null)
  const sandboxSnap = useSandboxSubscription(state.socket, workspaceId ?? null)

  const workspaceName = useMemo(() => {
    if (!workspaceId) return null
    return state.sidebarData.independentWorkspaces.find((ws) => ws.id === workspaceId)?.name ?? workspaceId
  }, [workspaceId, state.sidebarData.independentWorkspaces])

  const handleSaveAgent = useCallback(
    (config: AgentConfig) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.agent.save",
        workspaceId,
        config,
      }), "Agent config saved")
    },
    [workspaceId, state.socket]
  )

  const handleRemoveAgent = useCallback(
    (agentId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.agent.remove",
        workspaceId,
        agentId,
      }), "Agent config removed")
    },
    [workspaceId, state.socket]
  )

  const handleAddRepo = useCallback(
    (localPath: string, label?: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.repo.add",
        workspaceId,
        localPath,
        label,
      }), "Repo added")
    },
    [workspaceId, state.socket]
  )

  const handleCloneRepo = useCallback(
    (origin: string, targetPath: string, label?: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.repo.clone",
        workspaceId,
        origin,
        targetPath,
        label,
      }), "Repo clone started")
    },
    [workspaceId, state.socket]
  )

  const handleRemoveRepo = useCallback(
    (repoId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.repo.remove",
        workspaceId,
        repoId,
      }), "Repo removed")
    },
    [workspaceId, state.socket]
  )

  const handlePullRepo = useCallback(
    (repoId: string) => {
      toastCommand(state.socket.command({
        type: "workspace.repo.pull",
        repoId,
      }), "Pull started")
    },
    [state.socket]
  )

  const handleCancelWorkflow = useCallback(
    (runId: string) => {
      if (!workspaceId) return
      toastCommand(state.socket.command({
        type: "workspace.workflow.cancel",
        workspaceId,
        runId,
      }), "Workflow cancelled")
    },
    [workspaceId, state.socket]
  )

  const handlePushRepo = useCallback(
    (repoId: string) => {
      toastCommand(state.socket.command({
        type: "workspace.repo.push",
        repoId,
      }), "Push started")
    },
    [state.socket]
  )

  if (!workspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">No workspace selected</p>
      </div>
    )
  }

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("agents")

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <PageHeader title={workspaceName ?? "Workspace"} />
      <div className="px-4 mb-3">
        <SegmentedControl
          value={activeTab}
          onValueChange={setActiveTab}
          options={TAB_OPTIONS}
          size="sm"
          className="w-full md:w-auto"
          optionClassName="flex-1 md:flex-initial justify-center"
        />
      </div>
      <div className="flex-1 min-h-0 mx-4 mb-4 rounded-lg overflow-hidden border border-border bg-background">
        {activeTab === "agents" && (
          <AgentConfigPanel
            configs={agentSnap?.configs ?? []}
            onSave={handleSaveAgent}
            onRemove={handleRemoveAgent}
          />
        )}
        {activeTab === "repos" && (
          <RepoPanel
            repos={repoSnap?.repos ?? []}
            onAddRepo={handleAddRepo}
            onCloneRepo={handleCloneRepo}
            onRemoveRepo={handleRemoveRepo}
            onPullRepo={handlePullRepo}
            onPushRepo={handlePushRepo}
          />
        )}
        {activeTab === "workflows" && (
          <WorkflowPanel
            runs={workflowSnap?.runs ?? []}
            activeRunIds={workflowSnap?.activeRunIds ?? []}
            onCancelRun={handleCancelWorkflow}
          />
        )}
        {activeTab === "sandbox" && (
          <SandboxPanel
            snapshot={sandboxSnap}
            onCommand={(cmd) => { void state.socket.command(cmd) }}
            workspaceId={workspaceId}
          />
        )}
      </div>
    </div>
  )
}
