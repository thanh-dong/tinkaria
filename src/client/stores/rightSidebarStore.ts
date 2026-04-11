import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ProjectRightSidebarLayout {
  isVisible: boolean
  size: number
}

interface RightSidebarState {
  workspaces: Record<string, ProjectRightSidebarLayout>
  toggleVisibility: (workspaceId: string) => void
  setSize: (workspaceId: string, size: number) => void
  clearProject: (workspaceId: string) => void
}

export const RIGHT_SIDEBAR_MIN_SIZE_PERCENT = 20
export const RIGHT_SIDEBAR_MAX_SIZE_PERCENT = 50
export const DEFAULT_RIGHT_SIDEBAR_SIZE = 30
export const RIGHT_SIDEBAR_MIN_WIDTH_PX = 300

function clampSize(size: number) {
  if (!Number.isFinite(size)) return DEFAULT_RIGHT_SIDEBAR_SIZE
  return Math.min(RIGHT_SIDEBAR_MAX_SIZE_PERCENT, Math.max(RIGHT_SIDEBAR_MIN_SIZE_PERCENT, size))
}

function createDefaultProjectLayout(): ProjectRightSidebarLayout {
  return {
    isVisible: false,
    size: RIGHT_SIDEBAR_MIN_SIZE_PERCENT,
  }
}

function getProjectLayout(workspaces: Record<string, ProjectRightSidebarLayout>, workspaceId: string): ProjectRightSidebarLayout {
  return workspaces[workspaceId] ?? createDefaultProjectLayout()
}

export function migrateRightSidebarStore(persistedState: unknown) {
  if (!persistedState || typeof persistedState !== "object") {
    return { workspaces: {} }
  }

  const state = persistedState as { workspaces?: Record<string, Partial<ProjectRightSidebarLayout>>; projects?: Record<string, Partial<ProjectRightSidebarLayout>> }
  const workspaces = Object.fromEntries(
    Object.entries(state.workspaces ?? state.projects ?? {}).map(([workspaceId, layout]) => [
      workspaceId,
      {
        isVisible: false,
        size: clampSize(layout.size ?? DEFAULT_RIGHT_SIDEBAR_SIZE),
      },
    ])
  )

  return { workspaces }
}

export const useRightSidebarStore = create<RightSidebarState>()(
  persist(
    (set) => ({
      workspaces: {},
      toggleVisibility: (workspaceId) =>
        set((state) => ({
          workspaces: {
            ...state.workspaces,
            [workspaceId]: {
              ...getProjectLayout(state.workspaces, workspaceId),
              isVisible: !getProjectLayout(state.workspaces, workspaceId).isVisible,
            },
          },
        })),
      setSize: (workspaceId, size) =>
        set((state) => ({
          workspaces: {
            ...state.workspaces,
            [workspaceId]: {
              ...getProjectLayout(state.workspaces, workspaceId),
              size: clampSize(size),
            },
          },
        })),
      clearProject: (workspaceId) =>
        set((state) => {
          const { [workspaceId]: _removed, ...rest } = state.workspaces
          return { workspaces: rest }
        }),
    }),
    {
      name: "right-sidebar-layouts",
      version: 2,
      migrate: migrateRightSidebarStore,
    }
  )
)

export const DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT: ProjectRightSidebarLayout = {
  isVisible: false,
  size: RIGHT_SIDEBAR_MIN_SIZE_PERCENT,
}

export function getDefaultProjectRightSidebarLayout() {
  return {
    ...DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT,
  }
}
