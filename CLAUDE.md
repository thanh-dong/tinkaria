# Kanna

Web UI for Claude Code & Codex CLIs. Full-stack TypeScript: React 19 (client) + Bun HTTP/WS (server).

## Architecture

This project uses C3 docs in `.c3/`.
For architecture questions, changes, audits, file context -> `/c3`.
Operations: query, audit, change, ref, rule, sweep.
File lookup: `c3x lookup <file-or-glob>` maps files/directories to components + refs.

## Key Patterns

- **Event sourcing**: JSONL append-only logs + snapshot compaction (`ref-ref-event-sourcing`)
- **CQRS**: Write via events, read via derived snapshots (`c3-214`)
- **WebSocket subscriptions**: Topic-based real-time state broadcasting (`ref-ref-websocket-protocol`)
- **Multi-provider**: Claude + Codex normalized through ProviderCatalog (`ref-ref-provider-abstraction`)
- **Zustand stores**: Client-side UI state, localStorage-persisted (`ref-ref-zustand-stores`)

## Constraints

- Bun runtime only (not Node.js) — `rule-rule-bun-runtime`
- Strict TypeScript (no `any`) — `rule-rule-strict-typescript`
- React 19 function components
- Tailwind CSS 4 with CSS variable theming

## Coding Rules

- **Error extraction**: `error instanceof Error ? error.message : String(error)` in all catch blocks — `rule-error-extraction`
- **Testing**: Bun test, `describe`/`test`, `afterEach` cleanup, typed helpers, no jest, env var isolation (save/clear/restore), isolated ZDOTDIR for PTY tests — `rule-bun-test-conventions`
- **Type guards**: `is*()` predicates, `normalize*()` coercers, `require*`/`get*` duality — `rule-type-guards`
- **Logging**: `LOG_PREFIX` constant, `console.warn` for recoverable, never bare `console.error` — `rule-prefixed-logging`
- **Fallbacks**: Normalize external input, handle ENOENT/SyntaxError, never crash on bad data — `rule-graceful-fallbacks`

## Dev

```bash
bun install
bun run dev        # full stack (client + server)
bun run dev:client # frontend only (port 5174)
bun run dev:server # backend only (port 3210)
bun test           # run tests
bun run check      # typecheck + build
```
