# Session Lessons

Keep this file short and durable. Merge repeats. Drop stale one-off notes before adding new entries.

- [2026-04-06] Match task scope to the current worktree, not to stale assumptions. Before preserving or deleting a subsystem, prove it still exists on the active branch.
- [2026-04-06] Separate browser-surface cleanup from protocol/runtime decommissioning. Removing embedded terminal UI does not by itself remove terminal infrastructure.
- [2026-04-06] Feed blocking review findings back into `tasks/todo.md` immediately so the handoff reflects real blockers, scope drift, and branch constraints.
- [2026-04-06] Default product direction is browser/PWA-first. Do not preserve or extend tauri/native-companion paths unless the user explicitly reopens that effort.
- [2026-04-07] Match `spawn_agent` guidance to real fork semantics. If a delegated chat can inherit bounded parent transcript context, expose it explicitly as `fork_context` and keep the visible child prompt clean.
- [2026-04-07] Treat user-facing forking as derived session seeding, not delegation. The fork textarea is intent input to a context builder, not the literal first prompt to send unchanged.
- [2026-04-07] Fork presets should be scaffolds, not workflows. Let preset selection prefill editable intent and pass the preset into the builder as a lens, not as the final generated prompt.
- [2026-04-08] Diashort embeds should keep the full `/d/` controller surface when zoom/navigation matters. Prefer iframe rendering of the document URL over forcing the stripped `/e/` embed URL.
- [2026-04-08] Live transcript follow must account for streaming growth after the view has already reached bottom. Exact-bottom intersection fixes are necessary but not sufficient on their own.
- [2026-04-08] When repo instructions name `agent-browser`, treat it as the installed CLI and run live browser verification directly instead of assuming the tool is unavailable.
- [2026-04-03] For attach/connectivity work, prefer the public server-origin path. Do not rely on WSL-local bootstrap files or hidden WS ports; prove the Windows-facing `/nats-ws` endpoint returns `101 Switching Protocols` before changing native code.
- [2026-04-03] Keep queued drafts as local per-chat pending state with cleanup rules and original submit options. Do not promote them into transcript/server state just to survive refresh.
- [2026-04-03] Busy-composer UX should keep the queue affordance explicit as `Queue`, keep queued content above the composer only, and preserve `ArrowUp` as the restore path.
- [2026-04-07] Skip ADRs for tiny user-level convenience wiring. If the change is just a wrapper script or agent entrypoint outside product architecture, prefer the smallest direct script/config edit.
- [2026-04-08] When reporting runtime breakage, preserve intended architecture separately from current implementation. State design intent first, then name the divergence so findings do not reframe the target design as wrong.
