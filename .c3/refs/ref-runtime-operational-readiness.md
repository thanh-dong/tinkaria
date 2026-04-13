---
id: ref-runtime-operational-readiness
c3-seal: 5f3418ccb49b0e08c44dfad055c0d6b94b0edb27cc629510d4a1ac636592c849
title: runtime-operational-readiness
type: ref
goal: Make the Bun/NATS/runtime stack operationally observable and crash-resilient so health endpoints, startup behavior, and logs describe whether required runtime actors are actually ready to serve traffic — and child process failures cannot cascade into server death.
---

## Goal

Make the Bun/NATS/runtime stack operationally observable and crash-resilient so health endpoints, startup behavior, and logs describe whether required runtime actors are actually ready to serve traffic — and child process failures cannot cascade into server death.

## Choice

Use a single detailed `/health` contract for the active runtime surfaces. Required components fail fast or return health failure: embedded NATS daemon, NATS connection, and split runner when enabled. Non-critical components report degraded state without blocking HTTP readiness: the background local Codex kit. Logs announce startup, readiness, malformed runtime metadata, and shutdown with the shared Tinkaria log prefix.

Child process crash isolation: the main server process must survive any child process failure (Codex CLI, vendored tools like ripgrep, NATS daemon). IPC writes to dead children are guarded by closed-state checks and try/catch. Fire-and-forget async handlers use `.catch()` to prevent unhandled rejections. A global `unhandledRejection` handler in the CLI entry point logs but does not exit.

## Why

Operators need evidence that the runtime is serving real work, not just that the HTTP process exists. Process-only checks miss split-runner registration, stale heartbeats, dead NATS children, and soft-failed background Codex kit startup. A component health contract plus prefixed logs reduces false green deployments and makes incident triage faster.

Child processes carry external risk: vendored binaries may crash on incompatible platforms (e.g., jemalloc 4K-page binaries on 16K-page Asahi Linux), Codex CLI may exit unexpectedly, and tool subprocesses may coredump. Without crash isolation, a single coredumping `rg` invocation can cascade through unhandled rejections and kill the entire server process. The defense-in-depth strategy (IPC guards + async safety + global handler) ensures the server stays up and reports the failure through the health contract rather than dying silently.

## How

Startup must synchronously fail on required runtime actors that cannot initialize: `nats-daemon`, NATS connector, and split runner registration/heartbeat when split mode is enabled.

`/health` returns structured component status for the owned runtime actors: `natsDaemon`, `natsConnection`, `runner`, and `codexKit`.

Required-component failure returns HTTP 503. Background or optional component failure is surfaced as degraded component state with explicit error text, not silently swallowed.

Readiness is based on operational signals instead of assumptions: PID/aliveness for subprocesses, KV registration, and fresh heartbeat timestamps for remote runners and kits.

### Subprocess crash isolation

Three layers of defense prevent child process failures from killing the server:

1. **IPC write guards** (`rule-subprocess-ipc-safety`): All writes to child process stdin check `context.closed` before writing and wrap the write in try/catch. A dead child's stdin raises EPIPE — this must never propagate as an unhandled error.
**IPC write guards** (`rule-subprocess-ipc-safety`): All writes to child process stdin check `context.closed` before writing and wrap the write in try/catch. A dead child's stdin raises EPIPE — this must never propagate as an unhandled error.

2. **Async handler safety**: Fire-and-forget async calls (`handleServerRequest`, `handleNotification`) append `.catch(() => {})` so that failures after the child dies do not become unhandled rejections.
**Async handler safety**: Fire-and-forget async calls (`handleServerRequest`, `handleNotification`) append `.catch(() => {})` so that failures after the child dies do not become unhandled rejections.

3. **Global safety net**: `process.on("unhandledRejection")` in `cli.ts` logs stray rejections with `console.warn` instead of allowing Bun's default exit-on-rejection behavior. This is a last-resort backstop, not a substitute for fixing root causes.
**Global safety net**: `process.on("unhandledRejection")` in `cli.ts` logs stray rejections with `console.warn` instead of allowing Bun's default exit-on-rejection behavior. This is a last-resort backstop, not a substitute for fixing root causes.

When a child process dies, `failContext` cleanly resolves all pending work: pushes an error transcript entry, finishes the async queue, rejects pending RPC promises, and marks the context closed. Subsequent writes are silently dropped.
