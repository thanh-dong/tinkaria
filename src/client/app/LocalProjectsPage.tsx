import { useNavigate, useOutletContext } from "react-router-dom"
import type { DiscoveredSession } from "../../shared/types"
import { LocalDev } from "../components/LocalDev"
import type { TinkariaState } from "./useTinkariaState"

export function LocalProjectsPage() {
  const state = useOutletContext<TinkariaState>()
  const navigate = useNavigate()

  async function handleResumeHomepageSession(projectId: string, session: DiscoveredSession) {
    if (session.chatId) {
      navigate(`/chat/${session.chatId}`)
      return
    }

    await state.handleResumeSession(projectId, session.sessionId, session.provider)
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
        sessionsForProject={(projectId) => state.sessionsSnapshots.get(projectId)?.sessions ?? []}
        onResumeSession={handleResumeHomepageSession}
      />
    </div>
  )
}
