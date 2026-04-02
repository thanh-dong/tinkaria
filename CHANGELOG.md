# Changelog

## 1.0.0-rc - 2026-04-02

This release marks the transition from `Kanna` to `Tinkaria` and rolls up the current verified release surface into the first release candidate under the new product identity.

### Highlights

- Rebranded the project from `Kanna` to `Tinkaria`, including package/bin identity, app branding, logo assets, and compatibility handling for existing local data roots.
- Added session discovery and resume flows with session picker UI, cross-window session search, transcript import, and resume/refresh transport commands.
- Expanded transcript rendering with rich-content blocks, immersive overlays, Mermaid/embed support, local preview handling, and typed `present_content` transcript support.
- Improved chat/runtime correctness by disposing provider runtime state on delete, retaining read state after reply, and clearing queued drafts after queued flush.
- Reduced frontend effect misuse by lifting audited state transitions into explicit machine-style logic and mount/open-boundary ownership.
- Added the first Streamdown transcript rendering spike for assistant text to improve incomplete-markdown streaming behavior.
- Added UI identity overlay groundwork and broader tagged UI surfaces for inspectability and C3 bridgeability.
- Added experimental desktop companion groundwork with Tauri shell/bootstrap, desktop renderer registration, and native webview plumbing.

### Added

- Session discovery for Claude and Codex histories plus sidebar resume flows.
- `present_content` dynamic tool normalization, hydration, and transcript rendering support for Codex.
- Rich transcript primitives including `RichContentBlock`, `ContentOverlay`, `EmbedRenderer`, and rich-content auto-expand hints.
- Local transcript file preview routing and in-app preview dialog support.
- Tauri shell/bootstrap files and desktop renderer/native webview protocol groundwork.
- `Tinkaria` branding assets, shared brand mark components, and startup migration support for legacy `~/.kanna*` data roots.

### Changed

- Package/bin identity now targets `tinkaria`.
- Assistant transcript text rendering now uses Streamdown while preserving the existing markdown adapter seam.
- Internal app-shell symbols and files moved from `Kanna*` to `Tinkaria*` naming where appropriate.
- Frontend state handling removed multiple audited React effect misuse paths in favor of explicit state transitions.
- UI identity coverage expanded across sidebar, chat shell, settings, and related inspectable surfaces.

### Fixed

- Deleting chats now disposes idle provider runtime state instead of only cancelling active turns.
- Replying to the latest visible message now preserves read state instead of reopening from stale unread position.
- Queued follow-up sends no longer restore stale drafts after the queued turn auto-flushes.
- Session picker search now reaches older sessions outside the default visible window.
- Empty chat branding now uses the shared Tinkaria mark instead of the legacy flower icon.
- Release verification hardening now passes native-preview TypeScript checks, stabilized NATS subscription tests, and made PTY shell tests deterministic.

### Verification

- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `bun test`
- `bun run build`
- `agent-browser` smoke check against `http://127.0.0.1:3210/settings/general`
- `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
