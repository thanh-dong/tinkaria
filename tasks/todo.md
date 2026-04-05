# Kanna Tasks

## Completed: Sidebar Provider Glyph

**Status**: Verified. Sidebar chat rows now show a tiny provider glyph beside the kebab menu so Claude vs Codex is visible at a glance without adding row text or changing the existing status indicators.

**Root cause**:
1. `src/client/components/chat-ui/sidebar/ChatRow.tsx` only exposed runtime status and row actions, so provider identity was hidden unless the user opened the chat and inspected the composer controls.
2. Sidebar row data already included `provider`, but the UI was not using it.

**Fix**:
1. Reused the existing provider icon set and added a compact, low-emphasis glyph immediately left of the row actions button in `src/client/components/chat-ui/sidebar/ChatRow.tsx`.
2. Added an accessible provider label on the glyph so SSR/static markup and assistive tech can distinguish `Claude` vs `Codex`.
3. Extended `src/client/app/TinkariaSidebar.test.tsx` with a sidebar render assertion covering the provider glyph and updated the test harness to include `TooltipProvider` now that project rows render tooltips in the test fixture.

**Verified**:
1. RED: `bun test src/client/app/TinkariaSidebar.test.tsx` failed before the UI change because the expected `Codex` glyph marker was absent.
2. GREEN: `bun test src/client/app/TinkariaSidebar.test.tsx`
3. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
4. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

## Completed: PWA Stale Session Resume Refresh

**Status**: Verified. Standalone/PWA chat sessions now treat long background gaps and broken reconnect states as stale, then proactively refresh the active chat on foreground so transcript tails are fetched again instead of staying frozen mid-session.

**Root cause**:
1. `src/client/app/useTinkariaState.ts` only revalidated transcript cache on explicit socket disconnects or sidebar timestamp deltas, so a suspended mobile PWA could resume with a cached mid-turn transcript that still looked current.
2. `src/client/app/nats-socket.ts` exposed `ensureHealthyConnection()`, but it only forced a reconnect when the underlying NATS handle was missing, not when the transport had already fallen into a non-connected status.

**Fix**:
1. Added a standalone/PWA stale-resume policy in `src/client/app/useTinkariaState.ts` keyed off `visibilitychange`, `focus`, `online`, and `pageshow`, with a 15-second background threshold plus reconnect-state fallback.
2. Added a deduped active-chat refresh nonce so foreground recovery re-runs the chat subscription and refetches the transcript tail without adding cached API data or service-worker fetch caching.
3. Tightened `src/client/app/nats-socket.ts` so `ensureHealthyConnection()` reconnects whenever the socket status is not `connected`.
4. Added regression coverage in `src/client/app/useTinkariaState.test.ts` for the stale-resume decision boundary.

**Verified**:
1. `bun test src/client/app/useTinkariaState.test.ts`
2. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
3. `bun run build`
4. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

## Completed: Homepage Welcome-Back Sessions

**Status**: Verified. The `/` homepage now behaves like a return-to-work surface: it welcomes the user back, shows recent sessions first, and lets them resume directly instead of leading with a block of project statistics.

**Root cause**:
1. `src/client/components/LocalDev.tsx` opened the connected homepage with an `Overview` stats grid, so the first thing users saw was counts and renderer status instead of their recent work.
2. The home route did not consume the existing per-project session snapshots already available in `useTinkariaState`, so the homepage could not surface session resume affordances even though the sidebar already had them.

**Fix**:
1. Updated `src/client/app/LocalProjectsPage.tsx` to pass project session snapshots into `LocalDev` and route homepage resume actions through existing chat/session navigation behavior.
2. Added homepage recent-session derivation and resume cards in `src/client/components/LocalDev.tsx`, with copy that explicitly welcomes the user back and prioritizes session return.
3. Kept the project/workspace list available below the welcome-back section, while demoting the statistics grid so it no longer owns the first-screen emphasis.
4. Added regression coverage in `src/client/components/LocalDev.test.tsx` for recent-session ordering and the welcome-back homepage render.

**Verified**:
1. `bun test src/client/components/LocalDev.test.tsx`
2. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
3. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

## Completed: Queued Draft Persistence And Composer Submit Anchoring

**Status**: Verified. Queued drafts now survive refresh as local per-chat pending state, self-clean on age/size/orphan conditions, retain their original submit options, and render with a distinct pending treatment above the composer. Composer submit now also keeps the transcript anchored when the user is already near the bottom, including the queue path used by `Ctrl/Cmd+Enter`.

**Root cause**:
1. `useTinkariaState` kept queued text only in ephemeral in-memory submit-pipeline state, so refresh discarded it entirely.
2. Queue rendering reused a near-default card treatment, so pending local drafts did not read clearly as separate from transcript messages.
3. Composer queue submission could mutate the bottom layout without reasserting bottom-follow for users already near the tail, which produced the apparent jump back toward the previous reply.

**Fix**:
1. Extended `src/client/stores/chatInputStore.ts` with persisted queued drafts keyed by `chatId`, including `updatedAt` and the original submit options.
2. Added self-cleaning normalization for queued drafts: blank removal, 7-day TTL expiry, 20k-character trimming, and orphan reconciliation against current sidebar chats.
3. Hydrated `useTinkariaState` submit-pipeline state from the persisted queued drafts and synced queue mutations back into the store.
4. Cleared queued drafts on manual clear, restore-to-composer, successful flush, chat delete, and project removal.
5. Updated `src/client/components/chat-ui/ChatInput.tsx` so the queued block uses a visibly pending local style instead of normal message-adjacent styling.
6. Added a dedicated near-bottom composer-submit threshold so queue/send submissions keep bottom-follow when the user is already close to the tail.

**Verified**:
1. RED: `bun test src/client/stores/chatInputStore.test.ts src/client/app/useTinkariaState.test.ts src/client/components/chat-ui/ChatInput.test.ts`
2. GREEN: `bun test src/client/stores/chatInputStore.test.ts src/client/app/useTinkariaState.test.ts src/client/components/chat-ui/ChatInput.test.ts src/client/app/useTinkariaState.machine.test.ts`
3. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
4. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

## Completed: Alt-Shift Overlay Hold Latch

**Status**: Verified in tests and build checks. The Alt+Shift UI identity overlay now latches to the pre-hovered target for a single hold cycle instead of chasing later pointer movement, so the modal remains reachable while the keys stay down. To inspect a different spot, release and repress Alt+Shift.

**Root cause**: `src/client/app/App.tsx` kept updating the overlay pointer target and anchor on every non-overlay `pointermove`, even after the Alt+Shift combo was active. That caused the modal to keep retargeting as the cursor moved toward it, making it difficult to reach.

**Fix**:
1. Added a regression test in `src/client/app/App.test.tsx` that proves one Alt+Shift hold latches the current target and only refreshes after release.
2. Updated `bindUiIdentityOverlayWindowEvents()` in `src/client/app/App.tsx` to track modifier state locally and ignore non-overlay pointer moves while Alt+Shift is active.
3. Tightened the existing overlay-owned pointer-target test to reflect the intended flow: pre-hover a target, hold Alt+Shift, then move into the modal without retargeting.

**Verified**:
1. RED: `bun test src/client/app/App.test.tsx`
2. GREEN: `bun test src/client/app/App.test.tsx`
3. `bun test src/client/app/App.test.tsx src/client/components/ui/UiIdentityOverlay.test.tsx`
4. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
5. `bun run build`
6. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

**Notes**:
1. `agent-browser` could load the local page shell in this environment, but the React app never mounted under browser automation (`#root` stayed empty on both `http://127.0.0.1:5174` and `http://127.0.0.1:5175`), so a live interactive smoke for the overlay remained blocked by the local runtime rather than by this change.

## Completed: Busy Composer Stop + Queue Controls

**Status**: Verified. When a chat is actively processing, the composer now keeps `Stop` visible and adds a sibling `Queue` button. Queued content still renders only in the existing block above the composer, and repeated queue actions continue to concatenate into that single block.

**Root cause**: `src/client/components/chat-ui/ChatInput.tsx` collapsed the busy-state composer action into a single stop control, so queueing remained a hidden capability even though the state pipeline already supported queued concatenation and restoration.

**Fix**:
1. Added explicit busy-state queue helpers and regression tests in `src/client/components/chat-ui/ChatInput.test.ts`.
2. Updated `src/client/components/chat-ui/ChatInput.tsx` to render `Stop` and `Queue` side-by-side while `canCancel` is true.
3. Wired `Queue` through the existing submit path, preserving the current queue block above the composer and the existing `ArrowUp` restore flow.

**Verified**:
1. RED: `bun test src/client/components/chat-ui/ChatInput.test.ts`
2. GREEN: `bun test src/client/components/chat-ui/ChatInput.test.ts src/client/app/useTinkariaState.machine.test.ts src/client/app/useTinkariaState.test.ts`
3. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
4. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
5. Browser smoke: `agent-browser open http://127.0.0.1:5174`
6. Browser smoke: `agent-browser screenshot` -> `/home/lagz0ne/.agent-browser/tmp/screenshots/screenshot-1775204169648.png`
7. Browser smoke: `agent-browser errors` -> no browser errors

**Notes**:
1. The current local browser session at `http://127.0.0.1:5174` did not expose an active processing chat to drive a live busy-state repro, so the browser check for this pass remained a page-load/error smoke rather than a full interactive queue demo.

## Completed: Dependency Upgrade Worktree Baseline

**Status**: Verified in isolated worktree `/home/lagz0ne/dev/kanna/.worktrees/upgrade-deps-latest` on branch `chore/upgrade-deps-latest`. The branch now carries a broad latest-version dependency bump without touching the main workspace beyond this handoff note and the C3 ADR.

**Scope**:
1. Upgraded `package.json` dependency ranges to the latest available versions, including `vite` `^8.0.3`, `@vitejs/plugin-react` `6.0.1`, `typescript` `6.0.2`, `lucide-react` `^1.7.0`, React `19.2.4`, and the latest listed Bun package-manager version `1.3.11`.
2. Regenerated `bun.lock` in the worktree with `bun install`.
3. Kept verification on an alternate local port to avoid clashing with the existing app sessions.

**Verified**:
1. Worktree setup: `git worktree add .worktrees/upgrade-deps-latest -b chore/upgrade-deps-latest`
2. Baseline before upgrade: `bunx @typescript/native-preview --noEmit -p tsconfig.json`
3. Baseline before upgrade: `bun run build`
4. Upgrade scan: `bun outdated`
5. Upgrade manifest: `bunx npm-check-updates -u`
6. Install updated graph: `bun install`
7. Post-upgrade typecheck: `bunx @typescript/native-preview --noEmit -p tsconfig.json`
8. Post-upgrade build: `bun run build`
9. Browser smoke on alternate port: `bunx vite preview --host 127.0.0.1 --port 4310`
10. `agent-browser open http://127.0.0.1:4310`
11. `agent-browser errors` -> no browser errors
12. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

**Notes**:
1. The preview smoke used `4310`, not the repo’s normal dev ports.
2. `agent-browser screenshot` saved a render artifact at `/home/lagz0ne/.agent-browser/tmp/screenshots/screenshot-1775191872904.png`.
3. Current worktree diff is limited to `package.json` and `bun.lock` (`git diff --stat` -> `2 files changed, 302 insertions(+), 232 deletions(-)`).

**Next**:
1. Decide whether to keep the dependency-only branch as a standalone PR or fold it into the broader release work.
2. If we want higher confidence than build smoke, run the full `bun test` suite in the worktree and fix any runtime/test-only regressions before merge.

## Completed: User Prompt Short-Word Wrapping

**Status**: Verified. User prompt bubbles now explicitly prefer normal word wrapping instead of allowing aggressive mid-word breaks for short prompts.

**Root cause**: `src/client/components/messages/UserMessage.tsx` rendered user prompts inside a `prose` bubble without any wrap override. In narrow layouts, typography/default wrap rules could break short prompt words more aggressively than desired.

**Fix**:
1. Added a focused regression test in `src/client/components/messages/UserMessage.test.tsx` that asserts the user bubble carries an explicit normal-wrap contract.
2. Updated `src/client/components/messages/UserMessage.tsx` to apply `break-normal` plus `overflow-wrap: break-word` on the bubble and nested paragraphs, keeping the fix local to user prompts.

**Verified**:
1. RED: `bun test src/client/components/messages/UserMessage.test.tsx`
2. GREEN: `bun test src/client/components/messages/UserMessage.test.tsx`
3. `bun test src/client/app/TinkariaTranscript.test.tsx src/client/components/messages/shared.test.tsx`
4. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
5. `agent-browser open http://127.0.0.1:5174` confirmed the local app is reachable; snapshot on the current session only exposed the shell/settings state, so a transcript-specific live repro was not available in this environment.

## Completed: Release Hardening For Full Tinkaria Release Surface

**Status**: Verification green on the current working tree. The branch is still `main` ahead of `origin/main`, but the known pre-release verification blockers reproduced earlier in this session have been cleared for the full `Tinkaria` release surface.

**Release delta from last push**:
1. Pushed-but-unreleased commit history adds session resume/session picker, inline rich-content viewer, local transcript preview opening, queued-draft/read-state fixes, audited frontend no-effects cleanup, provider cleanup on chat deletion, and multiple approved design/spec docs for overlay, SVG rich content, and Codex `present_content`.
2. The current dirty worktree expands that further with the `Kanna` -> `Tinkaria` rebrand, npm/bin rename to `tinkaria`, Tauri shell/bootstrap work, desktop renderer/native webview plumbing, transcript `present_content` typing/rendering, Streamdown transcript rendering, and internal symbol/file renames to `Tinkaria*`.
3. Package metadata is already pointed at the new release identity: `package.json` now uses `"name": "tinkaria"` and bin `"tinkaria"`, but the version is still `0.16.0`.

**Blockers fixed in this pass**:
1. Removed deprecated `compilerOptions.baseUrl` from `tsconfig.json`, added `src/vite-env.d.ts`, and tightened strict TypeScript callsites/types across the current dirty tree so `bunx @typescript/native-preview --noEmit -p tsconfig.json` now passes.
2. Stabilized `src/server/nats-bridge.test.ts` by replacing subscription-establishment timing guesses with `await testClient.flush()` before publish assertions.
3. Made PTY tests deterministic by allowing `src/server/terminal-manager.ts` to honor `TINKARIA_SHELL` and forcing `src/server/terminal-manager.test.ts` onto `/bin/sh`, which cleared the `ctrl+d` timeout and the earlier full-suite shell flake.

**Verification evidence**:
1. `git status --short --branch` -> `## main...origin/main [ahead 42]` plus extensive modified/untracked files.
2. `git log --oneline @{u}..HEAD` confirmed 42 unpushed commits through `541a3cb docs: refine overlay context selection rules`.
3. `git diff --stat @{u}` shows 102 changed paths, `10209` insertions, `2774` deletions.
4. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
5. `bun test` -> `576 pass`, `0 fail`
6. `bun run build`
7. Live browser smoke check via `agent-browser` against `http://127.0.0.1:3210/settings/general` confirmed `document.title === "Tinkaria"` and visible `data-ui-id` surfaces including `chat.sidebar` and `settings.page`.
8. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check` still passes structurally.

**Notes**:
1. `zerobased run tinkaria-release ...` brought the app up, but `http://tinkaria-release.localhost` returned `502 Bad Gateway` from Caddy during this smoke pass while direct `http://127.0.0.1:3210` access was healthy. Treat that as local router/environment follow-up, not a product release blocker for this branch.
2. Package metadata is already renamed to `tinkaria`, but `package.json` version remains `0.16.0`.

**Next**:
1. Cut the release boundary into commits from the current verified tree.
2. Bump the package version from `0.16.0`.
3. Draft release notes for the full `Tinkaria` rename + platform/runtime release.
4. Publish from a clean worktree once the release commit set is finalized.

## Completed: Vite Dev Watch Ignore Scope

**Status**: Verified. The Vite dev server is now configured to ignore unrelated Markdown files and the entire `src-tauri` tree, so edits in docs/specs/tasks and the desktop shell no longer get picked up by the web client watcher.

**Root cause**: `vite.config.ts` did not constrain `server.watch`, so the default watcher still observed repository Markdown churn and the unrelated Tauri subtree.

**Fix**:
1. Added a `DEV_WATCH_IGNORED` pattern list in `vite.config.ts` covering `**/*.md`, `**/*.markdown`, `**/*.mdx`, and `**/src-tauri/**`.
2. Wired that list into `server.watch.ignored` in the Vite config.
3. Added `src/shared/vite-config.test.ts` to lock the watch-ignore contract.

**Verified**:
1. `bun test src/shared/vite-config.test.ts`
2. `bun run build`
3. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

## Completed: Chat Empty-State Tinkaria Mark

**Status**: Verified. The empty chat page no longer renders the old Lucide flower icon; it now uses the shared `Tinkaria` SVG mark, matching the sidebar and collapsed navbar branding.

**Root cause**: `src/client/app/ChatPage.tsx` still imported and rendered `Flower` for the empty-state hero, so the rebrand cleanup missed that surface even after the shared sidebar mark was introduced.

**Fix**:
1. Added `ChatEmptyStateBrandMark()` in `src/client/app/ChatPage.tsx` to make the empty-state logo use the same shared `TinkariaSidebarMark` asset path.
2. Replaced the old `<Flower />` render in the empty-state block with `ChatEmptyStateBrandMark`.
3. Added a focused regression test in `src/client/app/ChatPage.test.ts` that asserts the empty-state HTML contains `tinkaria-mark-fine.svg` and not `lucide-flower`.

**Verified**:
1. RED: `bun test src/client/app/ChatPage.test.ts` failed because `ChatEmptyStateBrandMark` was not exported from `src/client/app/ChatPage.tsx`.
2. GREEN: `bun test src/client/app/ChatPage.test.ts`
3. `c3x check` (no errors; existing `ref-zod-defensive-validation` warnings remain)
4. `agent-browser eval 'document.body.innerHTML'` against the local dev server only exposed the pre-hydration Vite shell in this environment, so visual browser confirmation is still pending.

## Completed: Chat Delete Provider Cleanup

**Status**: Verified. Deleting a chat now disposes provider runtime state instead of only cancelling an active turn, which closes the leaked idle Codex app-server session tied to that chat. Project removal now uses the same disposal path for each chat.

**Root cause**: `chat.delete` only called `agent.cancel(chatId)` and then marked the chat deleted in the event store. `cancel()` only interrupts active turns; it does not tear down an already-idle Codex session, so deleting an idle Codex-backed chat left the app-server child process/session alive.

**Fix**:
1. Added `AgentCoordinator.disposeChat(chatId)` in `src/server/agent.ts` to cancel any active turn and unconditionally stop the Codex session for that chat.
2. Updated `src/server/nats-responders.ts` so both `chat.delete` and `project.remove` use `agent.disposeChat(...)` instead of `agent.cancel(...)`.
3. Added regression coverage in `src/server/agent.test.ts` and `src/server/nats-responders.test.ts` for idle-session disposal and responder wiring.

**Verified**:
1. RED: `bun test src/server/nats-responders.test.ts src/server/agent.test.ts` failed first because `disposeChat()` did not exist and `chat.delete` still used `cancel()`.
2. GREEN: `bun test src/server/nats-responders.test.ts src/server/agent.test.ts`
3. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
4. `bunx @typescript/native-preview --noEmit -p tsconfig.json` still fails on the pre-existing `tsconfig.json` `baseUrl` removal error and was not changed by this fix.

## In Progress: Codex Present Content

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-codex-present-content-design.md`
**Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-02-codex-present-content.md`

**Status**: Plan written. Waiting on execution mode selection.

**Summary**: Add a first-class Codex dynamic tool path, `present_content`, so Codex can intentionally surface structured transcript artifacts with `AskUserQuestion`-level integration quality instead of relying only on assistant markdown conventions.

**Approved shape**:
1. Advertise `present_content` on Codex turn start as a client-owned dynamic tool.
2. Normalize it into a typed transcript tool call/result pair and persist the structured payload.
3. Render it with a dedicated transcript component that reuses `RichContentBlock`, markdown rendering, and embeds.
4. Keep assistant markdown as the fallback contract.

## In Progress: Tauri Companion / Native Webview Research

## Completed: Homepage Cleanup

**Status**: Verified. `/` is now a cleaner launchpad instead of a mixed onboarding/diagnostics surface. The connected homepage focuses on machine/project context and actionable project cards, while the disconnected state keeps a single clear setup path.

**Root cause**:
1. `src/client/components/LocalDev.tsx` mixed setup instructions, desktop smoke diagnostics, and project picking on the same homepage.
2. Connected project cards only exposed a basename, which made the page weak as a real workspace selector.
3. Desktop-renderer diagnostics were taking prime homepage space even though renderer-specific detail already lives on the companion route.

**Fix**:
1. Replaced the connected `Desktop Smoke` card with a compact overview row covering total projects, saved/discovered split, and desktop-renderer status.
2. Reworked the project grid so cards now show title, full path, source label, and chat count, sorted by recent activity first.
3. Simplified the disconnected state to one status block plus two focused setup cards instead of the previous explanatory flow diagram.
4. Removed now-unused homepage external-link plumbing from `LocalProjectsPage`.
5. Added focused homepage helper/test coverage in `src/client/components/LocalDev.test.tsx`.

**Verified**:
1. `bun test src/client/components/LocalDev.test.tsx`
2. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
3. `bun run build`

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-tauri-native-webview-companion-design.md`
**Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-02-tauri-native-webview-companion.md`
**Next Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-03-tauri-two-window-desktop.md`

**Status**: Companion registration, desktop renderer snapshots, the first real steering path, tray/logging lifecycle, and the dedicated desktop settings route are implemented. The bootstrap path is now server-first: the Windows companion no longer depends on a local bootstrap file, normalizes the discovered companion server back to the public `5174` origin, and prefers `/auth/token` + `/nats-ws` there. Task 2 from the two-window desktop plan is now in place in the native runtime: Tauri opens a borderless `main-shell` window pointed at the browser-hosted server route, registers native maximize/fullscreen commands, hides the primary shell on close instead of exiting, and exposes a tray `Open Tinkaria` restore path. The Tauri capability file now grants remote IPC/window access to the `main-shell` route on `http://127.0.0.1:5174/*` / `http://localhost:5174/*`. The browser-hosted shell chrome is now reduced to the existing sidebar header only: the desktop maximize/fullscreen controls reveal only while hovering the Tinkaria logo/header cluster, alongside the collapse affordance, and that same cluster acts as the drag region. Current blocker: the public `/nats-ws` surface on the running dev server still returns `HTTP 200` instead of upgrading, so the Windows companion cannot complete native NATS attach yet. A defensive legacy fallback exists, but the old direct `natsWsUrl` from the WSL-hosted manifest is not reachable from Windows (`os error 10061`), which confirms the public proxy path must work for cross-WSL desktop attach.

**Summary**: Research how to incorporate Tauri so controlled content uses native webviews instead of iframes. The approved direction is now companion-only: the main server stays browser-first, exposes a single main-server surface for browser/desktop settings, advertises the native NATS attach target through the companion manifest/bootstrap, and Tauri attaches as a native peer that provides tray lifecycle, settings access, and managed native webviews.

**Current decisions**:
1. Prefer hybrid architecture eventually, but start with a smaller-scope Tauri companion/shell.
2. Controlled content should support local and LAN/Tailscale targets first, with optional proxied remote targets later.
3. UX should support both docked and pop-out controlled webviews.
4. Runtime discovery/control should be NATS-first; avoid relying on HTTP for coordination.
5. Companion discovery should attach to the public server origin first; local bootstrap files are no longer a valid cross-WSL contract.
6. Tauri should stay companion-only for now: tray lifecycle, settings access, reconnect behavior, and native webviews, not frontend ownership.
7. Browser-facing companion UX should be server-first: `/desktop/:rendererId` is the dedicated desktop route, outside the normal sidebar/settings shell.
8. Public companion discovery no longer needs a separate NATS WebSocket URL because the main server fronts the browser `/nats-ws` path.
9. The companion must be defensive against stale manifest payloads during migration: prefer the discovered manifest origin for `serverUrl`, but optionally parse legacy `natsWsUrl`/`authToken` fields as compatibility fallback.

**Regression note (2026-04-02)**:
1. The committed baseline did not include the `desktop-renderers` snapshot topic in the shared/server snapshot pipeline, which explains the `Unknown topic type: desktop-renderers` runtime error on stale code paths.
2. The current dirty worktree already contains the runtime support in `src/shared/protocol.ts` and `src/server/nats-publisher.ts`.
3. Added regression coverage so the desktop renderer snapshot path is exercised in `src/server/nats-publisher.test.ts`, `src/shared/nats-subjects.test.ts`, and `src/server/nats-streams.test.ts`.

**Verified**:
1. `bun test src/server/nats-publisher.test.ts src/shared/nats-subjects.test.ts src/server/nats-streams.test.ts`
2. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
3. `bun test src/shared/desktop-companion.test.ts`
4. `bun -e 'import { startKannaServer } from "./src/server/server"; ... fetch("http://127.0.0.1:5220/desktop-companion.json") ...'`
5. `bun test src/shared/desktop-bootstrap.test.ts src/server/desktop-bootstrap.test.ts src/shared/desktop-companion.test.ts`
6. `cargo test --manifest-path src-tauri/Cargo.toml`
7. `cargo check --manifest-path src-tauri/Cargo.toml`
8. `bun run build`
9. `agent-browser open http://127.0.0.1:5174/settings/general`
10. `agent-browser snapshot`
11. `agent-browser errors --clear`
12. Windows smoke: rebuilt `src-tauri/target/x86_64-pc-windows-gnu/debug/tinkaria-desktop.exe`, staged it under `C:\Users\duc\AppData\Local\Temp\tinkaria-desktop-smoke\`, refreshed `C:\Users\duc\.tinkaria-dev\data\desktop-bootstrap.json`, and verified `Get-Process -Id 10708` returned `ProcessName : tinkaria-desktop` with the process still alive after launch.
13. `cargo test --manifest-path src-tauri/Cargo.toml`
14. `cargo check --manifest-path src-tauri/Cargo.toml`
15. `cargo build --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu`
16. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
17. `cargo test --manifest-path src-tauri/Cargo.toml --target-dir /tmp/tinkaria-tauri-target`
18. `cargo check --manifest-path src-tauri/Cargo.toml --target-dir /tmp/tinkaria-tauri-target`
19. `cargo build --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --release --target-dir /tmp/tinkaria-tauri-win-target`
20. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh coverage` -> `100%`
21. `bun test src/client/app/App.test.tsx src/client/app/DesktopCompanionPage.test.tsx src/shared/desktop-companion.test.ts src/client/app/useTinkariaState.test.ts`
22. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
23. `cargo test --manifest-path src-tauri/Cargo.toml settings::tests::settings_window_document_is_local_and_branded --target-dir /tmp/tinkaria-tauri-target`
24. `cargo test --manifest-path src-tauri/Cargo.toml manifest::tests::parses_desktop_companion_manifest_json --target-dir /tmp/tinkaria-tauri-target`
25. `bun run build`
26. `cargo check --manifest-path src-tauri/Cargo.toml --target-dir /tmp/tinkaria-tauri-target`
27. `cargo build --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --release --target-dir /tmp/tinkaria-tauri-win-target`
28. `agent-browser open http://127.0.0.1:5175/desktop/desktop:LAGZ0NE`
29. `agent-browser errors --clear`
30. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
31. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh coverage` -> `100%`
32. `bun test src/shared/desktop-companion.test.ts`
33. `cargo test --manifest-path src-tauri/Cargo.toml manifest::tests::derives_server_url_from_manifest_url --target-dir /tmp/tinkaria-tauri-target`
34. `cargo test --manifest-path src-tauri/Cargo.toml manifest::tests::resolves_legacy_transport_fields_when_present --target-dir /tmp/tinkaria-tauri-target`
35. `cargo test --manifest-path src-tauri/Cargo.toml settings::tests::companion_settings_route_targets_a_specific_renderer --target-dir /tmp/tinkaria-tauri-target`
36. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
37. `cargo check --manifest-path src-tauri/Cargo.toml --target-dir /tmp/tinkaria-tauri-target`
38. `bun run build`
39. `agent-browser open http://127.0.0.1:5174/desktop/desktop:LAGZ0NE`
40. `agent-browser errors`
41. `curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==' http://127.0.0.1:5174/nats-ws` -> returned `HTTP/1.1 200 OK` with the Vite shell instead of `101`
42. `bun -e 'const ws = new WebSocket("ws://127.0.0.1:43659"); ...'` -> `open`
43. `curl -sSf http://127.0.0.1:5174/auth/token`
44. `cargo build --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --release --target-dir /tmp/tinkaria-tauri-win-target`
45. Windows launch smoke via `cmd.exe /C start "" "C:\Users\duc\AppData\Local\Temp\tinkaria-desktop-release\tinkaria-desktop-20260403b.exe"` plus live log inspection under `C:\Users\duc\.tinkaria\logs\companion.log`
46. RED: `cargo test --manifest-path src-tauri/Cargo.toml primary_shell_window_title_uses_tinkaria_branding --target-dir /tmp/tinkaria-tauri-target` -> failed (`left: "Tinkaria Companion"`, `right: "Tinkaria"`)
47. GREEN: `cargo test --manifest-path src-tauri/Cargo.toml primary_shell_ --target-dir /tmp/tinkaria-tauri-target`
48. RED: `cargo test --manifest-path src-tauri/Cargo.toml primary_shell_close_requests_are_hidden_instead_of_exiting --target-dir /tmp/tinkaria-tauri-target` -> failed because `should_hide_primary_shell_on_close_requested` did not exist
49. GREEN: `cargo test --manifest-path src-tauri/Cargo.toml primary_shell_close_requests_are_hidden_instead_of_exiting --target-dir /tmp/tinkaria-tauri-target`
50. RED: `cargo test --manifest-path src-tauri/Cargo.toml tray_menu_ids_cover_diagnostics_surfaces --target-dir /tmp/tinkaria-tauri-target` -> failed because `OPEN_MAIN_SHELL_MENU_ID` did not exist
51. GREEN: `cargo test --manifest-path src-tauri/Cargo.toml tray_menu_ids_cover_diagnostics_surfaces --target-dir /tmp/tinkaria-tauri-target`
52. `cargo test --manifest-path src-tauri/Cargo.toml settings::tests::settings_window_close_requests_are_hidden_instead_of_exiting --target-dir /tmp/tinkaria-tauri-target`
53. `cargo check --manifest-path src-tauri/Cargo.toml --target-dir /tmp/tinkaria-tauri-target`
54. `cargo build --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-gnu --release --target-dir /tmp/tinkaria-tauri-win-target`
55. `agent-browser open http://127.0.0.1:5174/desktop/desktop:LAGZ0NE`
56. `agent-browser errors`
57. Windows launch smoke via `Start-Process -FilePath 'C:\Users\duc\AppData\Local\Temp\tinkaria-desktop-release\tinkaria-desktop-1775208584.exe'`
58. Windows process check: `Get-Process tinkaria-desktop*` -> PID `8744` for `tinkaria-desktop-1775208584`
59. `bun test src/client/app/App.test.tsx`
60. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
61. `bun run build`
62. `agent-browser open http://127.0.0.1:5174`
63. `agent-browser errors`
64. `agent-browser snapshot`
65. RED: `bun test src/client/app/TinkariaSidebar.test.tsx` after moving desktop controls into the sidebar header hover cluster
66. GREEN: `bun test src/client/app/TinkariaSidebar.test.tsx src/client/app/App.test.tsx`
67. `bunx @typescript/native-preview --noEmit -p tsconfig.json`
68. `bun run build`
69. `agent-browser open http://127.0.0.1:5174`
70. `agent-browser errors`

**Next**:
1. Fix the public dev `/nats-ws` upgrade path so a Windows native client gets `101 Switching Protocols` on `ws://127.0.0.1:5174/nats-ws` instead of the Vite shell HTML.
2. Once the public upgrade works, rerun the Windows companion smoke and confirm the log reaches `register_renderer` after the public-origin attach, with no legacy fallback needed.
3. Fix the public dev `/nats-ws` upgrade path so the Windows companion uses only the public `5174` server path, with no legacy fallback.
4. Keep the legacy manifest transport parsing only as migration compatibility; remove it after the running server/public proxy path is proven.
5. Route more controlled-content surfaces through desktop preference, not just transcript links.
6. Add reconnect-state handling so disconnected companion-hosted views disable or close cleanly.

## In Progress: Rich Content SVG Rendering

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-rich-content-svg-rendering-design.md`

**Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-02-rich-content-svg-rendering.md`

**Status**: Spec approved. Implementation plan written; waiting on execution mode selection.

**Summary**: The current transcript rich-content pipeline already upgrades fenced code blocks into `RichContentBlock`, but `svg` is not classified as an embed language. The approved direction is to extend the existing fenced rich-content path so `svg` renders image-first and still exposes raw source within the same viewer.

**Next**:
1. Choose execution mode.
2. Execute RED-GREEN-TDD for SVG embed classification, rendering, and regressions.
3. Run no-slop, simplify, review, and verification passes.

## In Progress: Alt+Shift UI Identity Overlay

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-ui-identity-overlay-design.md`
**Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-02-ui-identity-overlay.md`
**Expansion Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-ui-identity-overlay-expansion-design.md`
**Mobile Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-ui-identity-overlay-mobile-design.md`
**C3 Semantic Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-ui-identity-overlay-c3-semantic-design.md`

**Status**: First release works. Expansion design approved for taxonomy, broader visible coverage, deeper chat/sidebar interactables, and cursor-near placement.

**Summary**: Add a hold-to-reveal client-side overlay that shows curated, copyable `ui-id` labels for meaningful UI surfaces. While `Alt` + `Shift` is held, the hovered tagged surface reveals a short ancestor stack so users can reference either the exact component or the broader containing area in debug/LLM requests.

**Approved shape**:
1. Curated tags only, not automatic DOM-wide labeling.
2. Hold-only stack with nearest tagged surface first and up to 2 tagged ancestors above it.
3. Global app-level overlay controller with portal rendering and direct row-click copy.
4. First-release coverage focused on high-value chat/settings shells and major interaction surfaces.

**Task 4 outcome**:
1. Exported `getGlobalUiIdentityIds()` from `src/client/app/App.tsx` with the approved first-release ids for sidebar, terminal workspace, right sidebar, and settings page.
2. Tagged the `KannaSidebar`, `RightSidebar`, `TerminalWorkspace`, and `SettingsPage` shells with their curated `data-ui-id` identities.
3. Added `App.test.tsx` coverage for the exported id map and extended `RightSidebar.test.ts` to assert the tagged right-sidebar shell.

**Verified**:
1. RED: `bun test src/client/app/App.test.tsx src/client/components/chat-ui/RightSidebar.test.ts` failed first on the missing `getGlobalUiIdentityIds()` export and missing `data-ui-id="chat.right-sidebar"` tag.
2. GREEN: `bun test src/client/app/App.test.tsx src/client/components/chat-ui/RightSidebar.test.ts`
3. `bun test src/client/lib/uiIdentityOverlay.test.ts src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts`
4. `bun run build`
5. `bunx @typescript/native-preview --noEmit -p tsconfig.json` still fails on the pre-existing `tsconfig.json` `baseUrl` removal error and was not changed by Task 4.
6. `bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
7. Live smoke test via `agent-browser` against `http://localhost:5174/settings/general`: overlay resolved `settings.page` on the settings shell and `chat.sidebar` on the sidebar shell while the Alt+Shift modifier state was active, and `agent-browser errors` returned no browser errors.

**Expansion decisions**:
1. Use a hybrid taxonomy: persistent surfaces use `component + kind`, transient surfaces use explicit suffixes like `.menu`, `.dialog`, and `.popover`.
2. Expand breadth everywhere with `area`/`item` coverage, but go deeper on chat and sidebar actions/menus first.
3. Add a visible selected-area halo tied to the highlighted row.
4. Anchor the overlay near the live pointer and flip/clamp it near viewport edges instead of letting it drift away from the cursor.

**Mobile decisions**:
1. Trigger mobile inspect mode with a two-finger long press on a tagged surface.
2. Mobile inspect mode is sticky after entry rather than hold-only.
3. Dismiss explicitly with tap-outside, close affordance, or system back behavior.

**C3 semantic decisions**:
1. Keep the visible overlay label UI-readable.
2. Make the copied payload hybrid: `ui-id | c3:<component-id>`.
3. Treat copied overlay ids as a bridge into C3 rather than replacing codemap lookup.

## Completed: Streamdown Transcript Spike

**Status**: Verified. Implemented the first transcript-only Streamdown adoption step.

**Summary**: Replaced the assistant transcript text path with Streamdown while keeping Kanna's existing markdown adapter seam. The initial spike is intentionally narrow: only `TextMessage` now uses Streamdown, while local file preview, plan rendering, summaries, user bubbles, and settings changelog remain on `react-markdown`.

**Implemented**:
1. Added `streamdown` to the workspace and Tailwind `@source` wiring in `src/index.css`.
2. Switched `src/client/components/messages/TextMessage.tsx` from `react-markdown` to `Streamdown`.
3. Kept `createMarkdownComponents()` and `remarkRichContentHint` in place so local file links, rich-content fenced blocks, and `richcontent:autoExpand` continue to flow through Kanna's existing adapter.
4. Disabled Streamdown link-safety modal on the transcript path so Kanna's current link behavior remains unchanged.

**Outcome**:
1. Assistant transcript rendering now handles incomplete markdown more gracefully during streaming instead of leaking unfinished markers like raw `**`.
2. This remains an adapter migration, not a full renderer replacement. `react-markdown` is still used elsewhere in the app.
3. Streamdown currently brings in Mermaid and related markdown tooling transitively, so any broader rollout should account for bundle-size impact and decide whether those surfaces should share one wrapper or stay split.

**Recommended next step**:
1. Decide whether to continue the migration surface-by-surface or stop at transcript text only.
2. If continuing, migrate the remaining markdown surfaces behind a shared wrapper and remove `react-markdown` only after the last consumer is gone.

## Completed: Frontend Un-Effect Machine Lift

**Status**: Verified. The remaining audited frontend effect violations were removed by lifting hot-path state into explicit compound machines and replacing identity-reset effects with mount/open-boundary ownership.

**Fix**:
1. Added `projectSelection` and `submitPipeline` machines in `src/client/app/useKannaState.machine.ts`.
2. Rewired `src/client/app/useKannaState.ts` to use the machine layer, removing the project-repair effects and the queued-send flush loop effect.
3. Reworked `src/client/components/NewProjectModal.tsx` so modal form state resets on mount/open identity instead of in `useEffect`.
4. Reworked `src/client/components/ui/app-dialog.tsx` so prompt input initializes at prompt-open time instead of mirroring `initialValue` in an effect.
5. Replaced the `ChatPage` empty-state typing interval effect with a keyed CSS typewriter primitive in `src/client/app/ChatPage.tsx` and `src/index.css`.
6. Added focused machine and ChatPage coverage in `src/client/app/useKannaState.machine.test.ts` and `src/client/app/ChatPage.test.ts`.

**Verified**:
1. `bun test src/client/app/useKannaState.machine.test.ts src/client/app/useKannaState.test.ts src/client/app/ChatPage.test.ts src/client/app/SettingsPage.test.tsx src/client/components/chat-ui/ChatInput.test.ts`
2. `bun run build`
3. `c3x check`

## Completed: Read Scroll Retained After Reply

**Status**: Verified. If the user replies to the latest visible message in an existing chat, switching away and back now keeps that chat classified as read and reopens at the newer end of the transcript instead of jumping back to the older unread position.

**Root cause**: Read state only advanced when the transcript viewport was considered at-bottom. Replying to the latest message did not itself persist `lastSeenMessageAt`, so chat remounts could still classify the conversation as unread from stale read-state and choose the old top/unread scroll target.

**Fix**:
1. Added `getReadTimestampToPersistAfterReply()` in `src/client/app/useKannaState.ts`.
2. Updated successful sends in existing chats to persist the latest known sidebar `lastMessageAt` as read when replying catches the user up semantically, even if the viewport was not currently flagged as at-bottom.
3. Added focused regression coverage in `src/client/app/useKannaState.test.ts`.

**Verified**:
1. `bun test src/client/app/useKannaState.test.ts src/client/components/chat-ui/ChatInput.test.ts`
2. `bun run build`
3. `c3x check`

## Completed: Queued Chat Draft Persists After Tab Switch

**Status**: Verified. Queued follow-up submits no longer leave stale composer drafts behind after the queue auto-flushes and the user switches away and back to the chat.

**Root cause**: `ChatInput` persisted the raw textarea text to `chatInputStore` when `onSubmit()` returned `"queued"`. The queued text already lived in `useKannaState`'s per-chat queue buffer, so after that queue eventually flushed successfully, the stale persisted draft was still reloaded on remount/navigation.

**Fix**:
1. Added `shouldClearDraftAfterSubmit()` in `src/client/components/chat-ui/ChatInput.tsx`.
2. Changed queued submit handling so both `"queued"` and `"sent"` outcomes clear the persisted draft entry instead of storing the just-submitted text.
3. Added focused regression coverage in `src/client/components/chat-ui/ChatInput.test.ts`.

**Verified**:
1. `bun test src/client/components/chat-ui/ChatInput.test.ts`
2. `bun test src/client/app/useKannaState.test.ts`
3. `bun run build`
4. `c3x check`

## Completed: C3 React No-Effects Rule Research

**Status**: Verified. Added a C3 coding rule that converts React's "You Might Not Need an Effect" guidance into a repo-specific standard for client code.

**Summary**: Researched the official React 19.2 page `https://react.dev/learn/you-might-not-need-an-effect` and captured the practical replacement rules for Kanna: derive during render, use `useMemo` only for measured expensive pure work, reset by identity with `key`, keep event-driven logic in event handlers, and reserve Effects for true external-system synchronization only.

**C3 artifacts**:
1. Added rule `rule-react-no-effects`.
2. Added adoption ADR `adr-20260402-rule-react-no-effects-adoption`.
3. Wired the rule into client components: `c3-101`, `c3-103`, `c3-104`, `c3-110`, `c3-111`, `c3-112`, `c3-113`, `c3-114`, `c3-115`, `c3-116`, `c3-117`.

**Verified**:
1. `c3x check`

## Completed: Frontend React No-Effects Compliance Audit

**Status**: Audited. `c3x check` passes, but frontend client code still contains several rule violations that should be removed before the codebase can claim compliance with `rule-react-no-effects`.

**Audit method**:
1. Scanned all `src/client` React modules.
2. Deep-reviewed every production file containing `useEffect` or `useLayoutEffect`.
3. Classified each usage as either an allowed boundary sync or a violation of the new rule.

**Confirmed violations**:
1. `src/client/app/ChatPage.tsx` empty-state typing animation is driven by an Effect instead of a view-state/animation primitive.
2. `src/client/app/SettingsPage.tsx` mirrors store/router values into local draft state via four Effects.
3. `src/client/app/useKannaState.ts` uses Effects for derived selection state and queued-send workflow orchestration.
4. `src/client/components/NewProjectModal.tsx` resets local state from `open` in an Effect.
5. `src/client/components/chat-ui/ChatInput.tsx` mirrors locked composer state from props/store in an Effect.
6. `src/client/components/ui/app-dialog.tsx` seeds prompt input state from dialog state in an Effect.

**Allowed boundary effects**:
1. Window/media-query subscriptions, socket subscriptions, ResizeObserver bindings, imperative xterm lifecycle, and focused DOM/layout adapter hooks remain acceptable under the rule.

## Completed: React No-Effects Replacement Matrix Refinement

**Status**: Verified. Refined `rule-react-no-effects` with a repo-specific replacement matrix and recorded the decision in C3.

**Decision**:
1. Zustand is the standard replacement for shared browser-side client state and workflow coordination.
2. `useSyncExternalStore` or adapter hooks are the standard for external subscriptions.
3. TanStack Query is not installed and is not the default answer to Effect removal.
4. If TanStack Query is adopted later, it is reserved for pull-based remote server state, not local UI state or NATS push subscriptions.

**C3 artifacts**:
1. Updated `rule-react-no-effects`.
2. Added ADR `adr-20260402-refine-react-no-effects-state-matrix`.

**Verified**:
1. `c3x check`

## Completed: Fullscreen Response Overlay Spacing

**Status**: Verified. The fullscreen response overlay now preserves dialog-like inner spacing instead of letting content sit flush against the border.

**Summary**: Rich content opened through the response box fullscreen button reused the dialog shell but not an explicit inner spacing contract, so dense content could read as too close to the modal edge. The overlay now uses a dedicated inner wrapper that inherits the dialog inset baseline and adds a slightly roomier top inset for fullscreen reading.

**Fix**:
1. Extracted reusable dialog body inset constants in `src/client/components/ui/dialog.tsx`.
2. Updated `src/client/components/rich-content/ContentOverlay.tsx` to wrap fullscreen content in an explicit inset container.
3. Added focused regression coverage in `src/client/components/rich-content/ContentOverlay.test.tsx`.

**Verified**:
1. `bun test src/client/components/rich-content/ContentOverlay.test.tsx src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/messages/FileContentView.test.tsx`
2. `bun run build`
3. `c3x check`

## Completed: In-App Local File Preview for Transcript Links

**Status**: Verified. Local transcript file links now open an in-app preview dialog instead of jumping straight to the external editor.

**Summary**: Markdown and other local file links rendered in chat were still wired to `system.openExternal`, which broke the newer direct-view UX. The client now requests a local file preview from the server and renders it inside Kanna's web UI.

**Fix**:
1. Added non-mutating command `system.readLocalFilePreview` in `src/shared/protocol.ts` and `src/server/nats-responders.ts`.
2. Added `LocalFilePreviewDialog` plus a no-chrome `FileContentView` mode for in-app rendering.
3. Updated `useKannaState` / `ChatPage` so `handleOpenLocalLink()` opens the preview dialog instead of the editor.

**Verified**:
1. `bun test src/server/nats-responders.test.ts`
2. `bun test src/client/components/messages/FileContentView.test.tsx src/client/components/messages/LocalFilePreviewDialog.test.tsx src/client/components/messages/shared.test.tsx src/client/app/ChatPage.test.ts src/client/app/useKannaState.test.ts`
3. `bun run build`
4. `c3x check`
5. `bunx @typescript/native-preview --noEmit -p tsconfig.json` still fails on the pre-existing `tsconfig.json` `baseUrl` incompatibility.

## In Progress: Kanna Server Handoff Runbook

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-01-kanna-server-handoff-design.md`

**Status**: Design spec written. Next session should convert this into an executable operator runbook and, if useful, helper scripts for warm sync, promote, verify, and rollback.

**Summary**: Move Kanna between machines under the current local-file persistence model by treating it as a single-writer system. Keep one machine `active`, keep the other `standby`, warm-sync the Kanna data root, then cut over with stop -> final sync -> start -> verify.

**Approach**: Design-only. No persistence redesign, no central NATS dependency, no dual-active operation.

## Completed: Duplicate Chat Submit / Interrupt UI Entries

**Status**: Verified. Initial chat tail fetch now dedupes overlap with buffered live transcript events before hydration.

**Summary**: Duplicate submitted prompts and duplicate interrupted markers could appear when a live transcript entry arrived during the initial tail fetch for a chat. `useKannaState` concatenated fetched entries with buffered live events, so the same `_id` could render twice if it existed in both sets.

**Fix**:
1. Added `mergeFetchedAndBufferedTranscriptEntries()` in `src/client/app/useKannaState.ts` to dedupe overlap by transcript `_id`.
2. Added focused regression coverage in `src/client/app/useKannaState.test.ts`.

**Verified so far**:
1. `bun test src/client/app/useKannaState.test.ts`
2. `bun test src/client/components/chat-ui/ChatInput.test.ts`
3. `c3x check`
4. `bun run build`

## Completed: Chat Queue / Follow-up Prompt Staging

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-01-chat-queue-design.md`

**Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-01-chat-queue.md`

**Status**: Implemented and verified in the working tree.

**Summary**: Let the user submit follow-up prompts while a turn is still running. Busy submits append into one unsent multi-paragraph queue block above the composer; `ArrowUp` on an empty composer restores the full queued text into edit mode and unqueues it.

**Implemented scope**:
1. `src/client/app/useKannaState.ts` — queue state + idle flush logic
2. `src/client/components/chat-ui/ChatInput.tsx` — queue UI + `ArrowUp` restore behavior
3. `src/client/app/ChatPage.tsx` — thread queue props
4. Focused client tests for queueing, flush, restore, and regressions

**Approach**: RED-GREEN-TDD. Keep queue client-side only. Treat all unsent follow-ups as one queued text buffer, not discrete items. Honor C3 refs/rules up front and finish with C3 compliance + audit.

**Verified**:
1. `bun test src/client/components/chat-ui/ChatInput.test.ts src/client/app/useKannaState.test.ts`
2. `bun run build`
3. `c3x check`

**Notes**:
1. Queue flushes now remove sent text from the visible queue immediately, restore failed flushes deterministically, and wait for the next real busy -> idle transition before flushing newer queued text.
2. The queue remains scoped to the active chat UI while still preventing cross-chat flush leakage.

## In Progress: Chat Page Bug at `/chat/baa4d8f4-befe-4637-9f79-bb2638b30ebd`

**Plan**:
1. Reproduce the failure in `agent-browser`, capture a screenshot, and inspect console errors.
2. Compare the broken path against recent chat and skill-composition changes to isolate root cause.
3. Add a focused failing test for the regression.
4. Implement the minimal fix.
5. Verify with targeted tests and a browser re-check.

**Status**: Fixed client-side skill extraction bug. Browser reproduction was blocked by sandbox socket/listen restrictions; verified via focused tests and build.

## Next Up: Session Diff View (Right Sidebar)

**Plan**: `/home/lagz0ne/.claude/plans/stateless-hopping-crayon.md`

**Status**: Plan approved, not yet implemented.

**Summary**: Wire transcript edit_file/write_file data into the right sidebar (Cmd+B). Pure client-side — no server changes.

**Files to create/modify**:
1. NEW: `src/client/lib/useSessionDiffs.ts` — derivation hook
2. NEW: `src/client/lib/useSessionDiffs.test.ts` — tests
3. MODIFY: `src/client/components/chat-ui/RightSidebar.tsx` — render file list + diffs
4. MODIFY: `src/client/app/ChatPage.tsx` — wire props (~5 lines)

**Approach**: RED-GREEN-TDD. Reuse existing `FileContentView` for diff rendering. No new dependencies.

## Research In Progress: Upstream Attachment Uploads

**Upstream source**: `jakemor/kanna` latest tag `v0.18.0` at commit `cab0f1ab81492031928e3f84c00b585ac56f3f36` (released 2026-03-30 in the upstream repo).

**What upstream added**:
1. Shared attachment model in `src/shared/types.ts` and `chat.send` protocol support in `src/shared/protocol.ts`.
2. HTTP upload/content/delete endpoints in `src/server/server.ts`.
3. Disk persistence in `src/server/uploads.ts` under `./.kanna/uploads/`.
4. Prompt augmentation in `src/server/agent.ts` so providers receive attachment path metadata.
5. Transcript persistence/hydration so `user_prompt` messages retain attachments.
6. Composer attachment UI in `src/client/components/chat-ui/ChatInput.tsx`.
7. Attachment draft persistence in `src/client/stores/chatInputStore.ts`.
8. Transcript/composer attachment preview cards in `src/client/components/messages/AttachmentCard.tsx` and related preview helpers.

**Local architecture delta**:
1. This repo already has `Bun.serve`, but chat commands go through NATS responders instead of direct WebSocket command handling.
2. Current local `src/shared/types.ts` has no `ChatAttachment` model and `user_prompt` transcript entries do not carry attachments.
3. Current local `src/shared/protocol.ts` `chat.send` command has no `attachments` field.
4. Current local `src/client/components/chat-ui/ChatInput.tsx` has no file picker/upload state and `src/client/stores/chatInputStore.ts` only persists text drafts.
5. Current local transcript rendering only supports plain `UserMessage` bubbles, so transcript attachment cards would need a local rendering extension.

**Recommended first implementation slice**:
1. Adopt upstream's attachment data model and transcript shape.
2. Add upload/content/delete HTTP routes to local `src/server/server.ts` plus a local `src/server/uploads.ts`.
3. Extend `chat.send` through NATS with `attachments`.
4. Add composer upload UI and attachment draft persistence.
5. Add prompt augmentation in `src/server/agent.ts`.
6. Render attachments in composer and transcript, but keep drag/drop and richer preview polish secondary unless required.

**Risks / open decisions**:
1. Attachment prompt formatting must work for both Claude and Codex in this fork; upstream uses XML-like hint text prepended to the prompt.
2. Upload lifecycle needs cleanup rules for abandoned draft uploads and deleted chats.
3. The smallest useful cut is picker + upload + submit + transcript rendering; parity extras can follow.

**Next step**:
1. Confirm desired scope: strict parity with upstream `v0.18.0`, or a smaller first cut that ships picker/upload/submit/render first and defers nicer preview polish.

## In Progress: Tinkaria Rebrand

**Status**: Verified in working tree.

**Goal**: Rebrand the current fork from Kanna to Tinkaria, using the thinner `fine` SVG logo direction as the new primary brand asset.

**Scope**:
1. Update runtime branding constants, package/CLI identifiers, titles, prompts, and user-facing strings from `Kanna`/`kanna` to `Tinkaria`/`tinkaria`.
2. Replace current icon/logo references with the selected `Tinkaria` SVG assets where the web app and docs point to branded artwork.
3. Preserve existing local data by keeping compatibility in mind while changing branded paths and labels.
4. Finish with a no-slop pass, simplify pass, review pass, and full verification evidence.

**Plan**:
1. RED: updated branding tests to assert `Tinkaria` naming and path expectations, then ran them to confirm failure.
2. GREEN: implemented the minimal branding constant changes and compatibility handling needed for the tests to pass.
3. Propagated the new brand through package metadata, app title, prompts, docs, Tauri shell metadata, and icon references.
4. Ran targeted searches for lingering user-visible `Kanna`/`kanna` branding and kept only intentional legacy/internal references.
5. Verified with targeted tests, build, live browser smoke check, and `c3x check`.

**Notes**:
1. Added `src/server/branding-migration.ts` so existing `~/.kanna` and `~/.kanna-dev` roots are renamed forward to `~/.tinkaria` and `~/.tinkaria-dev` on startup instead of silently losing local state.
2. Switched the current web/app shell branding to the thinner `fine` `Tinkaria` SVG direction via `public/favicon.svg`, `assets/tinkaria-logo-fine.svg`, and `assets/tinkaria-mark-fine.svg`.
3. Left internal CSS class names and a few historical/test comments untouched where they are not user-visible or where they intentionally document legacy compatibility.

**Verified**:
1. `bun test src/shared/branding.test.ts src/server/branding-migration.test.ts src/shared/desktop-shell.test.ts src/server/agent.test.ts src/server/cli-runtime.test.ts src/server/keybindings.test.ts src/server/event-store.test.ts src/server/nats-responders.test.ts src/client/app/SettingsPage.test.tsx src/client/app/useKannaState.test.ts`
2. `bun run build`
3. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`
4. `bun run start -- --no-open --port 4310` plus `agent-browser` smoke check confirmed the live page title resolves to `Tinkaria`.

## Completed: Internal Kanna -> Tinkaria Symbol Refactor

**Status**: Verified in working tree.

**Summary**: Renamed the remaining internal `Kanna*` app-shell symbols and files to `Tinkaria*`, including the main sidebar/transcript/state modules, transport/status types, and client CSS identity classes. Updated C3 codemap coverage so the renamed files map back to their owning components.

**Refactor highlights**:
1. Renamed `KannaSidebar` -> `TinkariaSidebar`, `KannaTranscript` -> `TinkariaTranscript`, and `useKannaState` -> `useTinkariaState` including their file paths.
2. Renamed shared/client type identifiers such as `KannaTransport`, `KannaStatus`, and `KannaState` to `Tinkaria*` forms.
3. Extracted a shared branded sidebar mark component and wired both sidebar and collapsed chat-navbar surfaces to it.
4. Updated C3 entities and codemap patterns for `c3-0`, `c3-101`, `c3-110`, `c3-113`, and `c3-203` so lookups on renamed files resolve correctly again.

**Intentional leftovers**:
1. Legacy compatibility references such as `KANNA_RUNTIME_PROFILE`, `~/.kanna*`, and `kanna` session provenance remain on purpose.
2. Internal NATS subject prefixes `kanna.*` remain unchanged for protocol continuity.
3. Historical test fixtures, example paths, and upstream repo links that refer to the old fork name remain where they document legacy behavior or upstream lineage.

**Verified**:
1. `bun test src/client/app/tinkaria-naming.test.tsx src/client/app/useTinkariaState.test.ts src/client/app/useTinkariaState.machine.test.ts src/client/app/App.test.tsx src/client/app/ChatPage.test.ts src/client/components/chat-ui/ChatNavbar.test.tsx`
2. `bun run build`
3. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup 'src/client/app/TinkariaSidebar.tsx'`
4. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup 'src/client/app/useTinkariaState.ts'`
5. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup 'bin/tinkaria'`
6. `C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check`

## C3 Follow-up: Session Discovery Mapping

**Status**: Completed. Added ADR `adr-20260401-map-session-discovery-codemap`, added component `c3-217 session-discovery`, updated `c3-205 nats-transport` dependencies, and mapped `src/server/session-discovery.ts` into the codemap.

**Verified**:
1. `c3x lookup src/server/session-discovery.ts` now resolves to `c3-217`.
2. `c3x check` still passes except the pre-existing `c3-0` code-map warning.
3. `c3x coverage` still reports 100%.

## Recently Completed

### C3 Root Context Mapping Cleanup (2026-04-01)
- Removed the invalid `c3-0` system codemap that caused the persistent `code-map: c3-0 is not a component or ref` warning.
- Preserved the root-level repository context coverage by adding `ref-project-context` and moving the repo docs/config/assets/skill metadata codemap there.
- Verified with `c3x check` (0 issues), `c3x coverage` (100%), and `c3x lookup README.md` / `c3x lookup package.json` resolving to `ref-project-context`.

### Mobile Session Sidebar Swipe Reveal (2026-04-01)
- Added a mobile-only right-swipe gesture on the chat surface to open the existing left session sidebar without reaching for the top menu button.
- Guardrails: only starts from the left edge, ignores interactive controls, rejects mostly vertical drags, and no-ops when the sidebar is already open or desktop layout is active.
- Verified with focused Bun tests in `src/client/app/ChatPage.test.ts`, `bun run build`, and `c3x check` (only the pre-existing `c3-0` warning remains).
- Note: `bunx @typescript/native-preview --noEmit -p tsconfig.json` is currently blocked by the repo’s existing `tsconfig.json` `baseUrl` incompatibility with the native preview compiler.

### Session Resume Search Regression (2026-04-01)
- Root cause: `LocalProjectsSection` pre-filtered sessions to the current time window before passing them into `SessionPicker`, so picker search could never reach older sessions.
- Fix: moved the windowing/search decision into `SessionPicker` via `getVisibleSessions()`.
- Behavior now matches the design: default view stays windowed and capped, but search runs across the full discovered session list.
- Verified with targeted Bun tests for `SessionPicker` and `session-discovery`, plus `c3x check` (only the pre-existing `c3-0` warning remains).

### Transcript Performance Optimization (2026-04-01)
- IncrementalHydrator with push() + dirty-flag snapshot (parseTranscript.ts)
- tool_result dirty flag fix (latent React re-render bug)
- Virtualized transcript with @tanstack/react-virtual
- useMemo firstIndices for O(1) system_init/account_info lookup
- SPECIAL_TOOL_NAMES deduplication (derived.ts → KannaTranscript.tsx)
- bulkHydrate extraction in useKannaState.ts
- ChatInput: individual Zustand selectors + useCallback stabilization
- ChatPreferenceControls: React.memo wrapper
- 344 tests pass, 0 fail
