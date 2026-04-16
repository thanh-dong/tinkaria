import type { TranscriptRenderUnit } from "../../shared/types"
import type { ProcessedToolCall } from "../components/messages/types"

export const SPECIAL_TOOL_NAMES = new Set(["AskUserQuestion", "ExitPlanMode", "TodoWrite"])
const RESOLVED_TOOL_NAMES = new Set<string>(["TodoWrite"])

function getToolsFromRenderUnit(unit: TranscriptRenderUnit): ProcessedToolCall[] {
  if (unit.kind === "standalone_tool") return [unit.tool as ProcessedToolCall]
  if (unit.kind === "artifact") return [unit.artifact as ProcessedToolCall]
  if (unit.kind === "tool_group") return unit.tools as ProcessedToolCall[]
  if (unit.kind === "wip_block") return unit.steps.filter((step) => step.kind === "tool") as ProcessedToolCall[]
  return []
}

function findLatestUnresolvedToolId(messages: TranscriptRenderUnit[], toolName: string): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const tools = getToolsFromRenderUnit(messages[index]!)
    for (let toolIndex = tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolCall = tools[toolIndex]!
      if (toolCall.toolName === toolName && !toolCall.result) {
        return toolCall.id
      }
    }
  }
  return null
}

function findLatestToolId(messages: TranscriptRenderUnit[], toolName: string): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const tools = getToolsFromRenderUnit(messages[index]!)
    for (let toolIndex = tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolCall = tools[toolIndex]!
      if (toolCall.toolName === toolName) {
        return toolCall.id
      }
    }
  }
  return null
}

export function getLatestToolIds(messages: TranscriptRenderUnit[]) {
  const ids: Record<string, string | null> = {}
  for (const toolName of SPECIAL_TOOL_NAMES) {
    ids[toolName] = RESOLVED_TOOL_NAMES.has(toolName)
      ? findLatestToolId(messages, toolName)
      : findLatestUnresolvedToolId(messages, toolName)
  }
  return ids
}

export function canCancelStatus(status?: string) {
  return status === "starting" || status === "running" || status === "waiting_for_user" || status === "awaiting_agents"
}

export function isProcessingStatus(status?: string) {
  return status === "starting" || status === "running" || status === "waiting_for_user" || status === "awaiting_agents"
}
