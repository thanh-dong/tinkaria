# Tinkaria Tasks

This file is a handoff, not a changelog. Keep only active work, blockers, and the next useful step.

## Active

- In progress: Remove embedded terminal and settings surfaces.
  Status: browser-facing slice verified. ADR `adr-20260406-remove-terminal-and-settings` exists. Scope stays limited to browser product surfaces for embedded terminal access, terminal buttons/shortcuts/layout, and settings navigation/routes.
  Next: finish the shared-protocol/server/runtime audit before deleting anything that would amount to true terminal decommissioning. The current RC work only removes the remaining browser navbar actions and introduces a Codex hub-to-kit runtime seam.
  Verify: run the affected Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, and `c3x check` after the next code slice.

- In progress: Prepare `1.0.0-rc.2`.
  Status: release notes and package version now cover the post-`rc.1` delta: runtime/repo badges, last-read transcript restore, browser navbar cleanup, and the new local Codex kit runtime seam.
  Next: cut the RC tag/publish flow.
  Verify: targeted Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, `bun run build`, and `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check` all passed on 2026-04-06.

## Blockers / Constraints

- Browser-surface removal is not the same as runtime/protocol removal. Do not collapse those scopes.
- Current branch direction is browser/PWA-first. Do not preserve or revive tauri/native-companion paths unless the user explicitly reopens that work.

## Verified Baseline

- Session history picker now discovers Claude CLI history again because the publisher and discovery/resume paths share the same `.claude/projects` encoding. Verified on 2026-04-06 with targeted Bun tests (`src/server/nats-publisher.test.ts`, `src/server/session-discovery.test.ts`) and `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`.
- Chat transcript unread-anchor restore no longer re-arms during normal read-state updates; upward scrolling no longer fights the user with bottom-snap jiggle. Verified on 2026-04-06 with targeted Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, and `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`.
- Chat transcript read-boundary tracking is now frame-coalesced and boundary-deduped, so manual scrolling and smooth scroll-to-bottom no longer fight persisted read-state writes. Verified on 2026-04-06 with targeted Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, and `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`.
- Codex runtime now crosses a real hub-to-kit seam with project-to-kit assignment.
- Active chat navbar can now show status-bar style repo context: cwd basename, branch, and live git dirty counts, plus rough runtime/session usage badges.
- Chat navbar no longer exposes the obsolete open-folder or diff/right-sidebar buttons; that area is now free for future reuse.
- Transcript hydration now backfills older raw entries when a tool-heavy tail would otherwise render blank chat history.
- Last-read transcript behavior now persists a semantic per-chat `lastReadMessageId + lastReadBlockIndex` boundary with legacy timestamp fallback, restores unread chats to the next unread readable block inside a message when possible, and only advances chat-level `lastSeenMessageAt` when the tail is actually read or a reply succeeds.
- Internal branding/transport cleanup is done for active codepaths: Tinkaria naming is primary, transport namespace is generic, and the stale `~/.kanna*` migration path is gone.
- Session resume and active-chat navbar surfaces now expose runtime metadata already present in provider session logs.
- Diashort links now prefer rich embed presentation, including direct embed rendering through `present_content` and assistant-text auto-upgrade for bare links.
- The obsolete tauri companion path has been removed; product direction is browser/PWA-first.

## Cleanup Rule

- When a milestone is verified, compress it into one baseline bullet or remove it. Do not let completed work accumulate here.
