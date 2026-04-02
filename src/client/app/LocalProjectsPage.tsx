import { useOutletContext } from "react-router-dom"
import { LocalDev } from "../components/LocalDev"
import type { TinkariaState } from "./useTinkariaState"

export function LocalProjectsPage() {
  const state = useOutletContext<TinkariaState>()

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <LocalDev
        connectionStatus={state.connectionStatus}
        ready={state.localProjectsReady}
        snapshot={state.localProjects}
        desktopRenderers={state.desktopRenderers}
        startingLocalPath={state.startingLocalPath}
        commandError={state.commandError}
        onOpenProject={state.handleOpenLocalProject}
        onCreateProject={state.handleCreateProject}
        onOpenExternalLink={state.handleOpenExternalLink}
      />
    </div>
  )
}
