---
id: ref-ref-websocket-protocol
c3-seal: f7690336891cd4eadf76e4ce0b0e2653ba829810ebef842e37f029ec66e70332
title: ref-websocket-protocol
type: ref
goal: Enable real-time bidirectional communication between the Bun server and React client without polling, supporting multiple independent data streams over a single connection.
---

## Goal

Enable real-time bidirectional communication between the Bun server and React client without polling, supporting multiple independent data streams over a single connection.

## Choice

Single NATS WebSocket connection routed through the Bun HTTP server at `/nats-ws`. The client always connects to `ws://<host>/nats-ws`; the server proxies via `Bun.serve<NatsWsData>` to the internal NATS WS port. In dev mode, Vite proxies `/nats-ws` to the backend. Topics include: sidebar, chat, terminal, keybindings, update, local-projects. Messages carry a topic field for routing and typed payloads for each subscription channel.

## Why

- Single connection avoids overhead of multiple WS connections or HTTP polling
- Path-based routing (`/nats-ws`) avoids exposing the NATS WS port externally and works uniformly in dev (Vite proxy), production, and Tauri companion
- Topic-based routing keeps concerns separated without separate endpoints
- Typed message protocol provides compile-time safety on both client and server
- Subscriptions allow clients to opt into only the data streams they need
- Efficient for high-frequency updates (terminal output, chat streaming)
