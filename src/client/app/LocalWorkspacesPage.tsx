import { useState } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import type { DiscoveredSession } from "../../shared/types"
import { CreateWorkspaceModal } from "../components/CreateWorkspaceModal"
import { LocalDev } from "../components/LocalDev"
import type { AppState } from "./useAppState"

export function LocalProjectsPage() {
  const state = useOutletContext<AppState>()
  const navigate = useNavigate()
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)

  async function handleResumeHomepageSession(workspaceId: string, session: DiscoveredSession) {
    if (session.chatId) {
      navigate(`/chat/${session.chatId}`)
      return
    }

    await state.handleResumeSession(workspaceId, session.sessionId, session.provider)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <LocalDev
        connectionStatus={state.connectionStatus}
        ready={state.localProjectsReady}
        snapshot={state.localProjects}
        startingLocalPath={state.startingLocalPath}
        commandError={state.commandError}
        onOpenProject={state.handleOpenLocalProject}
        onCreateProject={state.handleCreateProject}
        sessionsForProject={(workspaceId) => state.sessionsSnapshots.get(workspaceId)?.sessions ?? []}
        onResumeSession={handleResumeHomepageSession}
        independentWorkspaces={state.sidebarData.independentWorkspaces}
        onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
        onOpenWorkspace={(wsId) => navigate(`/workspace/${wsId}`)}
      />
      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onConfirm={(name) => {
          void state.handleCreateWorkspace(name)
        }}
      />
    </div>
  )
}
