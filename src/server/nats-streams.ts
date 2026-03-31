import { jetstreamManager, RetentionPolicy, StorageType } from "@nats-io/jetstream"
import type { NatsConnection } from "@nats-io/transport-node"
import { ALL_TERMINAL_EVENTS, ALL_CHAT_MESSAGE_EVENTS } from "../shared/nats-subjects"
import { LOG_PREFIX } from "../shared/branding"

export const TERMINAL_EVENTS_STREAM = "KANNA_TERMINAL_EVENTS"
export const CHAT_MESSAGE_EVENTS_STREAM = "KANNA_CHAT_MESSAGE_EVENTS"

const MAX_AGE_NS = 5 * 60 * 1_000_000_000 // 5 minutes in nanoseconds

/** Creates or updates the JetStream stream for terminal events (memory-backed, 5 min / 10K msg retention). */
export async function ensureTerminalEventsStream(nc: NatsConnection): Promise<void> {
  const jsm = await jetstreamManager(nc)

  const config = {
    name: TERMINAL_EVENTS_STREAM,
    subjects: [ALL_TERMINAL_EVENTS],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
    max_age: MAX_AGE_NS,
    max_msgs: 10_000,
    max_bytes: 64 * 1024 * 1024, // 64 MB safety cap for memory-backed stream
  }

  try {
    await jsm.streams.info(TERMINAL_EVENTS_STREAM)
    await jsm.streams.update(TERMINAL_EVENTS_STREAM, config)
    console.warn(LOG_PREFIX, `JetStream stream ${TERMINAL_EVENTS_STREAM} updated`)
  } catch (error) {
    // info() throws when stream doesn't exist — safe to create.
    // Any other error will surface from add().
    await jsm.streams.add(config)
    console.warn(LOG_PREFIX, `JetStream stream ${TERMINAL_EVENTS_STREAM} created`)
  }
}

const CHAT_MSG_MAX_AGE_NS = 30 * 60 * 1_000_000_000 // 30 minutes in nanoseconds

/** Creates or updates the JetStream stream for chat message events (memory-backed, 30 min / 50K msg retention). */
export async function ensureChatMessageStream(nc: NatsConnection): Promise<void> {
  const jsm = await jetstreamManager(nc)

  const config = {
    name: CHAT_MESSAGE_EVENTS_STREAM,
    subjects: [ALL_CHAT_MESSAGE_EVENTS],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
    max_age: CHAT_MSG_MAX_AGE_NS,
    max_msgs: 50_000,
    max_bytes: 128 * 1024 * 1024, // 128 MB safety cap for memory-backed stream
  }

  try {
    await jsm.streams.info(CHAT_MESSAGE_EVENTS_STREAM)
    await jsm.streams.update(CHAT_MESSAGE_EVENTS_STREAM, config)
    console.warn(LOG_PREFIX, `JetStream stream ${CHAT_MESSAGE_EVENTS_STREAM} updated`)
  } catch (error) {
    // info() throws when stream doesn't exist — safe to create.
    // Any other error will surface from add().
    await jsm.streams.add(config)
    console.warn(LOG_PREFIX, `JetStream stream ${CHAT_MESSAGE_EVENTS_STREAM} created`)
  }
}
