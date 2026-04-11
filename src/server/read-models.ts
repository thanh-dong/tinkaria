import type {
  ChatRuntime,
  ChatSnapshot,
  SessionStatus,
  LocalWorkspacesSnapshot,
  SessionsSnapshot,
  SidebarChatRow,
  SidebarData,
  SidebarWorkspaceGroup,
} from "../shared/types"
import type { ChatRecord, StoreState, WorkspaceCoordinationState } from "./events"
import { createEmptyCoordinationState } from "./events"
import type { WorkspaceCoordinationSnapshot } from "../shared/workspace-types"
import { resolveLocalPath } from "./paths"
import { SERVER_PROVIDERS } from "./provider-catalog"

export function deriveStatus(chat: ChatRecord, activeStatus?: SessionStatus): SessionStatus {
  if (activeStatus) return activeStatus
  if (chat.lastTurnOutcome === "failed") return "failed"
  return "idle"
}

export function deriveSidebarData(
  state: StoreState,
  activeStatuses: Map<string, SessionStatus>
): SidebarData {
  const projects = [...state.workspacesById.values()]
    .filter((project) => !project.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const workspaceGroups: SidebarWorkspaceGroup[] = projects.map((project) => {
    const chats: SidebarChatRow[] = [...state.chatsById.values()]
      .filter((chat) => chat.workspaceId === project.id && !chat.deletedAt)
      .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt))
      .map((chat) => ({
        _id: chat.id,
        _creationTime: chat.createdAt,
        chatId: chat.id,
        title: chat.title,
        status: deriveStatus(chat, activeStatuses.get(chat.id)),
        unread: chat.unread,
        localPath: project.localPath,
        provider: chat.provider,
        model: chat.model ?? null,
        lastMessageAt: chat.lastMessageAt,
        hasAutomation: false,
      }))

    return {
      groupKey: project.id,
      localPath: project.localPath,
      chats,
    }
  })

  return { workspaceGroups }
}

export function deriveLocalWorkspacesSnapshot(
  state: StoreState,
  discoveredProjects: Array<{ localPath: string; title: string; modifiedAt: number }>,
  machineName: string
): LocalWorkspacesSnapshot {
  const workspaces = new Map<string, LocalWorkspacesSnapshot["workspaces"][number]>()

  for (const project of discoveredProjects) {
    const normalizedPath = resolveLocalPath(project.localPath)
    workspaces.set(normalizedPath, {
      localPath: normalizedPath,
      title: project.title,
      source: "discovered",
      lastOpenedAt: project.modifiedAt,
      chatCount: 0,
    })
  }

  for (const project of [...state.workspacesById.values()].filter((entry) => !entry.deletedAt)) {
    const chats = [...state.chatsById.values()].filter((chat) => chat.workspaceId === project.id && !chat.deletedAt)
    const lastOpenedAt = chats.reduce(
      (latest, chat) => Math.max(latest, chat.lastMessageAt ?? chat.updatedAt ?? 0),
      project.updatedAt
    )

    workspaces.set(project.localPath, {
      localPath: project.localPath,
      title: project.title,
      source: "saved",
      lastOpenedAt,
      chatCount: chats.length,
    })
  }

  return {
    machine: {
      id: "local",
      displayName: machineName,
    },
    workspaces: [...workspaces.values()].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)),
  }
}

export function deriveChatSnapshot(
  state: StoreState,
  activeStatuses: Map<string, SessionStatus>,
  chatId: string,
  messageCount: number,
  availableSkills?: string[],
): ChatSnapshot | null {
  const chat = state.chatsById.get(chatId)
  if (!chat || chat.deletedAt) return null
  const project = state.workspacesById.get(chat.workspaceId)
  if (!project || project.deletedAt) return null

  const runtime: ChatRuntime = {
    chatId: chat.id,
    workspaceId: project.id,
    localPath: project.localPath,
    title: chat.title,
    status: deriveStatus(chat, activeStatuses.get(chat.id)),
    provider: chat.provider,
    model: chat.model ?? null,
    planMode: chat.planMode,
    sessionToken: chat.sessionToken,
  }

  return {
    runtime,
    messageCount,
    availableProviders: [...SERVER_PROVIDERS],
    availableSkills: availableSkills ?? [],
  }
}

export function deriveSessionsSnapshot(
  cachedSnapshot: SessionsSnapshot | null
): SessionsSnapshot | null {
  return cachedSnapshot
}

/** Derive a coordination snapshot from any state with coordinationByWorkspace. */
export function deriveCoordinationSnapshot(
  state: { coordinationByWorkspace: Map<string, WorkspaceCoordinationState> },
  workspaceId: string,
): WorkspaceCoordinationSnapshot {
  const coord = state.coordinationByWorkspace.get(workspaceId) ?? createEmptyCoordinationState()

  const todos = [...coord.todos.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const claims = [...coord.claims.values()]
    .filter((c) => c.status !== "released")

  const worktrees = [...coord.worktrees.values()]
    .filter((w) => w.status !== "removed")

  const rules = [...coord.rules.values()]

  return {
    workspaceId,
    todos,
    claims,
    worktrees,
    rules,
    lastUpdated: coord.lastUpdated,
  }
}

/** Convenience overload accepting full StoreState (used by nats-publisher). */
export function deriveWorkspaceCoordinationSnapshot(
  state: StoreState,
  workspaceId: string,
): WorkspaceCoordinationSnapshot {
  return deriveCoordinationSnapshot(state, workspaceId)
}
