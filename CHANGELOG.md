# Changelog

## 1.0.0-rc.8 - 2026-04-08

This release candidate hardens the deployment-model shift before the next cut by making the new runtime actors publishable and documenting the safe-upgrade contract.

### Changed

- Updated the published package contents so the runtime subprocess entrypoints under `src/nats/` and `src/runner/` ship with the tarball instead of only working from source checkouts.
- Updated the architecture and handoff docs to describe the current multi-process runtime: embedded NATS daemon, background Codex kit daemon, and optional split runner mode.
- Expanded `/health` into an operational runtime contract with component status for embedded NATS, the server NATS connection, split runner readiness, and background Codex kit readiness.

### Fixed

- Fixed the RC packaging contract so installed builds can boot the spawned NATS daemon process introduced by the deployment-model change.
- Fixed operator docs that still referenced `Kanna`, `~/.kanna*`, and stale transport assumptions instead of Tinkaria's current runtime and data roots.
- Fixed split-mode health reporting so runner CLI readiness now requires both registration and fresh heartbeat instead of a blind process-up assumption.
- Fixed NATS snapshot publishing for active orchestration subscriptions so delegated-session hierarchy snapshots no longer spam `Unknown topic type: orchestration` in long-running deployments.

### Upgrade Notes

- Active turns are still not restart-safe across RC upgrade or machine handoff. Quiesce or cancel active Codex/runner work before cutover.
- After upgrade, verify `/health`, fetch a fresh auth token/browser session, and smoke-test at least one Claude send plus one Codex send.

### Verification

- `npm pack --dry-run`
- `bun test src/server/nats-publisher.test.ts`
- `bun test src/server/nats-daemon-manager.test.ts src/server/runner-manager.test.ts src/server/transcript-consumer.test.ts src/shared/runner-protocol.test.ts src/nats/nats-daemon.test.ts src/runner/runner.test.ts`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`

## 1.0.0-rc.7 - 2026-04-07

This release candidate rolls up the verified branch work into an explicit RC cut focused on session hygiene, faster merge flows, and mobile-safe dialog/composer behavior.

### Added

- Added server-side filtering for Tinkaria-owned quick-response helper sessions so fork, merge, and title-generation runs stay out of resumable session history.
- Added shared responsive dialog tokens and regression coverage so mobile modal surfaces consistently expand fullscreen with safe-area-aware chrome.

### Changed

- Changed merge-session UX to navigate into the merge chat immediately, keep prompt/send work in the background, and optionally close source sessions after merge.
- Changed session-picker mobile behavior to follow the same full-screen dialog contract as fork and merge surfaces while desktop keeps popover behavior.

### Fixed

- Fixed the mobile chat composer so `visualViewport` shrink and offset changes lift the composer, transcript spacing, and scroll affordance above the software keyboard.
- Fixed responsive modal drift across fork, merge, session picker, new-project, app dialog, and rich-content overlay surfaces by routing them through the shared dialog contract.

### Verification

- `bun test src/client/app/ChatPage.test.ts src/server/session-discovery.test.ts src/client/components/chat-ui/SessionPicker.test.tsx src/client/components/ui/dialog.test.tsx`
- `bun test`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`

## 1.0.0-rc.3 - 2026-04-07

This release candidate expands the fork-session workflow, hardens the Codex runtime transport, and tightens browser-first chat reliability across remote and mobile usage.

### Added

- Added fork-session intent presets plus server-side prompt seeding so implementation, investigation, cleanup, tests, docs, and alternative-approach forks start with better context.
- Added server-side Codex skill discovery and surfaced delegation guidance to spawned sessions so local Codex kits can advertise available project skills to new work.
- Added JetStream-backed chat event and local Codex kit coverage to validate the ordered-consumer runtime path.

### Changed

- Migrated the NATS transport to JetStream ordered consumers for gap-free replay and more stable remote session recovery.
- Reworked the chat workspace around forking: the navbar now leads with the fork action, the dialog is mobile-safe, and sidebar/session surfaces expose stronger C3-backed UI identity tags.
- Tightened runtime/session metadata handling across the navbar, transcript, and orchestration flow so forked chats and spawned agents carry cleaner context boundaries.

### Fixed

- Fixed session history discovery so Claude CLI history consistently reappears in the picker after publisher refreshes.
- Fixed remote/PWA connection establishment to reach the chat socket faster on reload.
- Fixed transcript read tracking and last-read restoration regressions that could fight manual scrolling or reopen chats at the wrong boundary.

### Verification

- `bun test src/client/hooks/useIsMobile.test.ts src/server/agent.test.ts src/server/chat-events-jetstream.test.ts src/server/local-codex-kit-jetstream.test.ts src/server/local-codex-kit.test.ts src/server/nats-publisher.test.ts src/server/nats-responders.test.ts src/server/nats-streams.test.ts src/server/orchestration.test.ts src/server/quick-response.test.ts src/server/session-discovery.test.ts src/server/skill-discovery.test.ts src/client/app/App.test.tsx src/client/app/ChatPage.test.ts src/client/app/TinkariaSidebar.test.tsx src/client/app/TinkariaTranscript.test.tsx src/client/app/nats-socket.test.ts src/client/app/useTinkariaState.test.ts src/client/components/LocalDev.test.tsx src/client/components/chat-ui/ChatNavbar.test.tsx src/client/components/chat-ui/ForkSessionDialog.test.tsx src/client/components/chat-ui/SessionPicker.test.tsx src/client/components/messages/TextMessage.test.tsx src/client/stores/skillCompositionStore.test.ts`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `bun run build`
- `C3X_MODE=agent bash /home/lagz0ne/.codex/skills/c3/bin/c3x.sh check`

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
- Removed the standalone browser settings experience and the old navbar/editor-driven terminal entrypoints.
- Removed editor handoff and `open_editor` infrastructure, including configurable keybindings and editor preset handling.
- Renamed the internal transport namespace from `kanna.*` to `runtime.*`.
- Removed legacy `~/.kanna*` startup migration support from the active runtime.

### Added

- Integrated `@chenglou/pretext` for transcript height estimation to reduce layout shift and scroll jank in long chats.
- Added font-readiness and cached message-height estimation utilities for transcript virtualization.

### Changed

- Repositioned Tinkaria as PWA/browser-first across docs, package surface, and architecture.
- Simplified chat, navbar, sidebar, and app-shell flows after removing desktop/native branches and de-emphasizing browser settings/terminal product surfaces.
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
- `agent-browser` smoke check against `http://127.0.0.1:3210/`
- `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
