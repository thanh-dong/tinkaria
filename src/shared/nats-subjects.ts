import type { SubscriptionTopic } from "./protocol"

const PREFIX = "runtime"
const SNAP_PREFIX = `${PREFIX}.snap.`

/** Map a subscription topic to a KV key (also the subject suffix after `runtime.snap.`) */
export function snapshotKvKey(topic: SubscriptionTopic): string {
  switch (topic.type) {
    case "chat": return `chat.${topic.chatId}`
    case "terminal": return `terminal.${topic.terminalId}`
    case "sessions": return `sessions.${topic.projectId}`
    default: return topic.type
  }
}

export function snapshotSubject(topic: SubscriptionTopic): string {
  return `${SNAP_PREFIX}${snapshotKvKey(topic)}`
}

export function terminalEventSubject(terminalId: string): string {
  return `${PREFIX}.evt.terminal.${terminalId}`
}

export function chatMessageSubject(chatId: string): string {
  return `${PREFIX}.evt.chat.${chatId}`
}

export function commandSubject(commandType: string): string {
  return `${PREFIX}.cmd.${commandType}`
}

/** Wildcard: all snapshot subjects */
export const ALL_SNAPSHOTS = `${SNAP_PREFIX}>`

/** Wildcard: all terminal events */
export const ALL_TERMINAL_EVENTS = `${PREFIX}.evt.terminal.>`

/** Wildcard: all chat message events */
export const ALL_CHAT_MESSAGE_EVENTS = `${PREFIX}.evt.chat.>`

/** Wildcard: all commands */
export const ALL_COMMANDS = `${PREFIX}.cmd.>`

/** KV bucket name for snapshot caching */
export const KV_BUCKET = "runtime_snapshots"
