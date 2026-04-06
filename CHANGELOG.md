# Changelog

## 1.0.0-rc.2 - 2026-04-06

This release candidate rolls the latest chat/runtime polish into the browser-first surface and introduces the first hub-to-kit execution seam for Codex turns.

### Added

- Added a local Codex kit daemon, project-to-kit registry, and remote Codex runtime bridge over NATS so Codex sessions can run through a stable hub-to-kit boundary.
- Added NATS subjects and server coverage for Codex kit registration, session lifecycle, turn streaming, interrupts, and tool-response relays.
- Added regression tests covering project-to-kit assignment and project-aware Codex session startup.

### Changed

- Agent coordination now starts Codex sessions through a runtime abstraction that carries `projectId` across the session boundary.
- Server startup now boots the default local Codex kit daemon and waits for kit availability before serving Codex runtime work.
- Chat navbar cleanup now removes the leftover finder and right-sidebar action cluster from the browser surface.

### Fixed

- Fixed chat navbar repo/runtime metadata polish by shipping the runtime badges and live repo dirty-count context added after `rc.1`.
- Fixed last-read transcript restore so refresh no longer jumps users to the wrong read position.

### Verification

- `bun test src/server/agent.test.ts src/server/local-codex-kit.test.ts src/client/app/ChatPage.test.ts src/client/components/chat-ui/ChatNavbar.test.tsx`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `bun run build`
- `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`

## 1.0.0-rc.1 - 2026-04-06

This release simplifies Tinkaria into a browser/PWA-first product, removes obsolete desktop/editor integration paths, and improves transcript stability and rendering performance.

### Breaking Changes

- Removed the experimental Tauri desktop companion and native webview/runtime plumbing.
- Removed the browser settings route and embedded terminal UI surfaces.
- Removed editor handoff and `open_editor` infrastructure, including configurable keybindings and editor preset handling.
- Renamed the internal transport namespace from `kanna.*` to `runtime.*`.
- Removed legacy `~/.kanna*` startup migration support from the active runtime.

### Added

- Integrated `@chenglou/pretext` for transcript height estimation to reduce layout shift and scroll jank in long chats.
- Added font-readiness and cached message-height estimation utilities for transcript virtualization.

### Changed

- Repositioned Tinkaria as PWA/browser-first across docs, package surface, and architecture.
- Simplified chat, navbar, sidebar, and app-shell flows after removing desktop/settings/terminal UI branches.
- Kept core keyboard shortcuts as direct built-ins instead of routing through the old keybinding system.
- Tightened C3 topology by removing stale terminal components and wiring defensive rules across affected components.

### Fixed

- Fixed blank chat transcript remounts when the latest transcript tail contains only non-rendered/tool-result entries by backfilling older renderable history.
- Hardened defensive parsing and validation around JSON decoding, CLI port handling, and responder file reads.
- Removed residual brand-coupled runtime naming and obsolete branding-migration code.

### Verification

- `git log @{u}..HEAD`
- `git diff --shortstat @{u}..HEAD`
- `git status --short`
- `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`

## 1.0.0-rc - 2026-04-02

This release marks the transition from `Kanna` to `Tinkaria` and rolls up the current verified release surface into the first release candidate under the new product identity.

### Highlights

- Rebranded the project from `Kanna` to `Tinkaria`, including package/bin identity, app branding, and logo assets.
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
- `Tinkaria` branding assets and shared brand mark components.

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
