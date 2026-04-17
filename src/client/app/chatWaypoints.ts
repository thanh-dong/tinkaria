import type { TranscriptRenderUnit } from "../../shared/types"

const DEFAULT_MAX_LABEL_CHARS = 50

export function getUnitDomId(item: TranscriptRenderUnit): string | undefined {
  if (item.kind === "wip_block" || item.kind === "tool_group") return item.id
  if (item.kind === "standalone_tool") return `msg-${item.tool.id}`
  if (item.kind === "artifact") return `msg-${item.artifact.id}`
  return `msg-${item.message.id}`
}

export interface ChatWaypoint {
  renderIndex: number
  domId: string
  label: string
}

export function truncateLabel(text: string, maxChars: number): string {
  const firstLine = text.split(/\r?\n/)[0]
  if (firstLine.length <= maxChars) return firstLine
  return firstLine.slice(0, maxChars - 1) + "\u2026"
}

export function extractWaypoints(messages: TranscriptRenderUnit[]): ChatWaypoint[] {
  const waypoints: ChatWaypoint[] = []
  for (let i = 0; i < messages.length; i++) {
    const unit = messages[i]
    if (unit.kind !== "user_prompt") continue
    waypoints.push({
      renderIndex: i,
      domId: getUnitDomId(unit)!,
      label: truncateLabel(unit.message.content, DEFAULT_MAX_LABEL_CHARS),
    })
  }
  return waypoints
}

const SCROLL_THRESHOLD_PX = 50

export function findCurrentWaypointIndex(
  waypoints: ChatWaypoint[],
  scrollTop: number,
  getWaypointOffset: (wp: ChatWaypoint) => number | null,
): number {
  if (waypoints.length === 0) return -1

  let currentIndex = -1

  for (let i = 0; i < waypoints.length; i++) {
    const top = getWaypointOffset(waypoints[i])
    if (top === null) continue
    if (top <= scrollTop + SCROLL_THRESHOLD_PX) {
      currentIndex = i
    } else {
      break
    }
  }

  return currentIndex
}
