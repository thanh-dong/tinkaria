---
id: c3-2
c3-seal: de67f8c8517de25d72181d1f7092cdf08fc18a3a52793ccee6e59c9864c3b652
title: server
type: container
boundary: service
parent: c3-0
goal: Bun HTTP + WebSocket server managing all persistent state, AI agent sessions, terminal processes, and real-time client communication.
---

## Goal

Bun HTTP + WebSocket server managing all persistent state, AI agent sessions, terminal processes, and real-time client communication.

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-201 | event-store | Foundation | active | JSONL event sourcing + snapshots |
| c3-203 | cli | Foundation | active | Entry point, supervisor, restart |
| c3-204 | shared-types | Foundation | active | Protocol, types, tool definitions |
| c3-210 | agent | Feature | active | Multi-turn AI session management |
| c3-211 | providers | Feature | active | Provider/model catalog |
| c3-213 | discovery | Feature | active | Project scanning |
| c3-214 | read-models | Feature | active | CQRS derived views |
| c3-215 | share | Feature | active | Tunnel/QR sharing |
| c3-216 | codex | Feature | active | Codex CLI integration |
## Responsibilities

- Persist all state via JSONL event logs with snapshot compaction
- Route WebSocket messages and manage topic-based subscriptions
- Coordinate multi-turn AI sessions (Claude SDK + Codex CLI)
- Spawn and manage PTY terminals
- Scan local filesystem for Claude/Codex projects
- Serve static SPA assets in production
## Complexity Assessment

Complex: Event sourcing with replay, multi-provider agent orchestration, subprocess management (CLI + PTY), CQRS read model derivation, real-time WebSocket broadcasting.
