---
id: ref-ref-jetstream-streaming
c3-seal: 3819da014b0681f344bf93ff527d9e71c9d76d37b8e5c93a396e675e63d55878
title: JetStream streaming architecture
type: ref
goal: Provide durable, gap-free, replayable message delivery for all real-time event streams in Tinkaria using NATS JetStream ordered consumers, eliminating silent message loss on disconnects and expensive full re-fetches on reconnect.
---

## Goal

Provide durable, gap-free, replayable message delivery for all real-time event streams in Tinkaria using NATS JetStream ordered consumers, eliminating silent message loss on disconnects and expensive full re-fetches on reconnect.

## Choice

Three memory-backed JetStream streams with ordered pull consumers:

| Stream | Subjects | Retention | Use |
| --- | --- | --- | --- |
| KANNA_TERMINAL_EVENTS | runtime.evt.terminal.> | 5 min / 10K msgs | Terminal output events |
| KANNA_CHAT_MESSAGE_EVENTS | runtime.evt.chat.> | 30 min / 50K msgs | Chat transcript entries |
| KANNA_KIT_TURN_EVENTS | runtime.kit.evt.turn.> | 5 min / 20K msgs | Kit daemon turn events |
Publishing: `js.publish(subject, payload)` — fire-and-forget with JetStream durability.
Consuming: Ordered consumers with `DeliverPolicy.New` for live sessions, filtered by subject (e.g. `runtime.evt.chat.<chatId>`).
Fallback: Client falls back to plain `nc.subscribe()` when JetStream is unavailable (e.g. stream not created yet).

## Why

Plain `nc.publish()`/`nc.subscribe()` is fire-and-forget — messages sent during a client disconnect are permanently lost. This causes:

- Lost `stream_end` sentinels that hang the hub-side queue forever
- Missing chat transcript entries requiring full re-fetch on every reconnect
- No replay capability for late-joining clients
JetStream ordered consumers provide gap-free delivery with automatic sequence tracking. The consumer handles reconnection internally, replaying any messages missed during the gap.

## How

**Server — publishing to JetStream:**

```ts
const js = jetstream(nc)
void js.publish(subject, payload).catch((error) => {
  console.warn(LOG_PREFIX, `JetStream publish failed: ${errorMessage(error)}`)
})
```
**Server — consuming with ordered consumer:**

```ts
const consumer = await js.consumers.get(STREAM_NAME, {
  filter_subjects: specificSubject,
  deliver_policy: DeliverPolicy.New,
})
const messages = await consumer.consume()
for await (const msg of messages) {
  const data = JSON.parse(new TextDecoder().decode(msg.data))
  // process data
}
await messages.close()
```
**Client — JetStream over WebSocket with fallback:**

```ts
try {
  const consumer = await js.consumers.get(STREAM_NAME, {
    filter_subjects: chatMessageSubject(chatId),
    deliver_policy: DeliverPolicy.New,
  })
  const messages = await consumer.consume()
  // iterate messages...
} catch {
  // Fallback to plain nc.subscribe()
  entry.eventSubscription = nc.subscribe(evtSubject)
}
```
**Stream name sharing:** Stream names are constants in `src/shared/nats-subjects.ts` (e.g. `CHAT_MESSAGE_EVENTS_STREAM_NAME`) — importable by both server and client without cross-boundary dependencies.
