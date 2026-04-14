---
id: c3-0
c3-seal: 7e7ff81c90a09aaa847aa0f9365099b15aebf105ec8f0dc9a0b9c4b1787a2632
title: tinkaria
goal: Provide a playful, web-based workbench UI for interacting with Claude Code and Codex — chat, terminals, project management, multi-provider support
---

# Tinkaria

Full-stack TypeScript web UI for AI coding assistants (Claude Code & Codex CLIs).

## Architecture

- **Client**: React 19 SPA with Zustand stores, Radix UI primitives, Tailwind CSS 4, xterm.js terminals
- **Server**: Bun HTTP + WebSocket server with event-sourced JSONL persistence and CQRS read models
- **External**: Spawns Claude/Codex CLI subprocesses, embedded PTY terminals, Cloudflared tunnels
## Key Patterns

- Event sourcing (JSONL logs + snapshot compaction)
- CQRS (write: events -> state, read: derived snapshots)
- WebSocket subscription model (topic-based: sidebar, chat, terminal, keybindings)
- Multi-provider abstraction (Claude + Codex, normalized catalog)
- Multi-turn AI session management with tool gating
## Constraints

- Bun runtime only (not Node.js)
- Strict TypeScript (no `any`)
- React 19 with function components
- Tailwind CSS 4 with CSS variable theming
