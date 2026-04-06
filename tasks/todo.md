# Tinkaria Tasks

This file is a handoff, not a changelog. Keep only active work, blockers, and the next useful step.

## Active

- In progress: Remove embedded terminal and settings surfaces.
  Status: browser-facing slice verified. ADR `adr-20260406-remove-terminal-and-settings` exists. Scope stays limited to browser product surfaces for embedded terminal access, terminal buttons/shortcuts/layout, and settings navigation/routes.
  Next: finish the shared-protocol/server/runtime audit before deleting anything that would amount to true terminal decommissioning.
  Verify: run the affected Bun tests, `bunx @typescript/native-preview --noEmit -p tsconfig.json`, and `c3x check` after the next code slice.

## Blockers / Constraints

- Browser-surface removal is not the same as runtime/protocol removal. Do not collapse those scopes.
- Current branch direction is browser/PWA-first. Do not preserve or revive tauri/native-companion paths unless the user explicitly reopens that work.

## Verified Baseline

- Codex runtime now crosses a real hub-to-kit seam with project-to-kit assignment.
- Active chat navbar can now show status-bar style repo context: cwd basename, branch, and live git dirty counts, plus rough runtime/session usage badges.
- Chat navbar no longer exposes the obsolete open-folder or diff/right-sidebar buttons; that area is now free for future reuse.
- Transcript hydration now backfills older raw entries when a tool-heavy tail would otherwise render blank chat history.
- Last-read transcript behavior now decides unread vs read scroll position from the sidebar row without waiting for runtime hydration, and refresh no longer auto-promotes the newest message to read before the initial scroll target settles.
- Internal branding/transport cleanup is done for active codepaths: Tinkaria naming is primary, transport namespace is generic, and the stale `~/.kanna*` migration path is gone.
- Session resume and active-chat navbar surfaces now expose runtime metadata already present in provider session logs.
- Diashort links now prefer rich embed presentation, including direct embed rendering through `present_content` and assistant-text auto-upgrade for bare links.
- The obsolete tauri companion path has been removed; product direction is browser/PWA-first.

## Cleanup Rule

- When a milestone is verified, compress it into one baseline bullet or remove it. Do not let completed work accumulate here.
