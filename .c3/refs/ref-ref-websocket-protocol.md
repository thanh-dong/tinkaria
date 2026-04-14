---
id: ref-ref-websocket-protocol
c3-seal: 91acf994786d2b3f0300046580db18ddd8475ce51ac61132da73952df4d8264a
title: websocket-protocol
type: ref
goal: 'Document the NATS WebSocket protocol for Tinkaria: /nats-ws routing, typed live subscriptions, reconnect/backfill behavior, and single-connection client/server streaming.'
---

## Goal

Document the NATS WebSocket protocol for Tinkaria: /nats-ws routing, typed live subscriptions, reconnect/backfill behavior, and single-connection client/server streaming.

## Choice

Single NATS WebSocket connection routed through the Bun HTTP server at `/nats-ws`. The client always connects to `ws://<host>/nats-ws`; the server proxies via `Bun.serve<NatsWsData>` to the internal NATS WS port. In dev mode, Vite proxies `/nats-ws` to the backend. Topics include: sidebar, chat, terminal, keybindings, update, local-projects. Messages carry a topic field for routing and typed payloads for each subscription channel.

## Why

- Single connection avoids overhead of multiple WS connections or HTTP polling
- Path-based routing (`/nats-ws`) avoids exposing the NATS WS port externally and works uniformly in dev (Vite proxy), production, and local companion contexts
- Topic-based routing keeps concerns separated without separate endpoints
- Typed message protocol provides compile-time safety on both client and server
- Subscriptions allow clients to opt into only the data streams they need
- Efficient for high-frequency updates (terminal output, chat streaming)
## How

Use the shared socket/NATS protocol boundary for every live client/server stream.

Implementation contract:

- Browser code connects through `/nats-ws`; never expose or hard-code the internal NATS WebSocket port.
- Subjects and stream names come from shared constants, not string literals in features.
- Each subscription must define snapshot shape, event shape, and reconnect/backfill behavior.
- Server-side proxy and responders must log failures with the shared prefix and preserve auth/lazy-open ordering.
- Tests must cover subscription shape, reconnect or fallback behavior, and typed payload handling for new channels.
