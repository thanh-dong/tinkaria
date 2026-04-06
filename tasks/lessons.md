# Session Lessons

Keep this file short and durable. Merge repeats. Drop stale one-off notes before adding new entries.

- [2026-04-06] Match task scope to the current worktree, not to stale assumptions. Before preserving or deleting a subsystem, prove it still exists on the active branch.
- [2026-04-06] Separate browser-surface cleanup from protocol/runtime decommissioning. Removing embedded terminal UI does not by itself remove terminal infrastructure.
- [2026-04-06] Feed blocking review findings back into `tasks/todo.md` immediately so the handoff reflects real blockers, scope drift, and branch constraints.
- [2026-04-06] Default product direction is browser/PWA-first. Do not preserve or extend tauri/native-companion paths unless the user explicitly reopens that effort.
- [2026-04-03] For attach/connectivity work, prefer the public server-origin path. Do not rely on WSL-local bootstrap files or hidden WS ports; prove the Windows-facing `/nats-ws` endpoint returns `101 Switching Protocols` before changing native code.
- [2026-04-03] Keep queued drafts as local per-chat pending state with cleanup rules and original submit options. Do not promote them into transcript/server state just to survive refresh.
- [2026-04-03] Busy-composer UX should keep the queue affordance explicit as `Queue`, keep queued content above the composer only, and preserve `ArrowUp` as the restore path.
