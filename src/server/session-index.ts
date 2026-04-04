import type { TranscriptEntry, NormalizedToolCall } from "../shared/types"
import type { StoreState } from "./events"
import type { SessionRecord, SessionStatus } from "../shared/project-agent-types"

interface MutableSessionRecord {
  chatId: string
  projectId: string
  intent: string
  status: SessionStatus
  provider: "claude" | "codex"
  branch: string | null
  filesTouched: Set<string>
  commandsRun: string[]
  lastActivity: string
}

function extractFilePath(tool: NormalizedToolCall): string | null {
  switch (tool.toolKind) {
    case "edit_file":
    case "read_file":
    case "write_file":
      return tool.input.filePath
    default:
      return null
  }
}

function extractCommand(tool: NormalizedToolCall): string | null {
  if (tool.toolKind === "bash") return tool.input.command
  return null
}

export class SessionIndex {
  private readonly sessions = new Map<string, MutableSessionRecord>()

  onMessageAppended(chatId: string, entry: TranscriptEntry, state: StoreState): void {
    const chat = state.chatsById.get(chatId)
    if (!chat) return

    let session = this.sessions.get(chatId)
    if (!session) {
      session = {
        chatId,
        projectId: chat.projectId,
        intent: "",
        status: "active",
        provider: chat.provider ?? "claude",
        branch: null,
        filesTouched: new Set(),
        commandsRun: [],
        lastActivity: new Date().toISOString(),
      }
      this.sessions.set(chatId, session)
    }

    session.lastActivity = new Date().toISOString()

    if (entry.kind === "user_prompt" && !session.intent) {
      session.intent = entry.content.slice(0, 200)
    }

    if (entry.kind === "tool_call") {
      const filePath = extractFilePath(entry.tool)
      if (filePath) session.filesTouched.add(filePath)

      const command = extractCommand(entry.tool)
      if (command) session.commandsRun.push(command)
    }

    if (entry.kind === "result") {
      session.status = entry.subtype === "success" ? "complete" : entry.subtype === "error" ? "failed" : "idle"
    }
  }

  getSessionsByProject(projectId: string): SessionRecord[] {
    const results: SessionRecord[] = []
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        results.push(this.toRecord(session))
      }
    }
    return results.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
  }

  getSession(chatId: string): SessionRecord | null {
    const session = this.sessions.get(chatId)
    return session ? this.toRecord(session) : null
  }

  private toRecord(s: MutableSessionRecord): SessionRecord {
    return {
      chatId: s.chatId,
      intent: s.intent,
      status: s.status,
      provider: s.provider,
      branch: s.branch,
      filesTouched: [...s.filesTouched],
      commandsRun: s.commandsRun.slice(),
      lastActivity: s.lastActivity,
    }
  }
}
