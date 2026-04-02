# Kanna Tasks

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

**Spec**: `/home/lagz0ne/dev/kanna/docs/superpowers/specs/2026-04-02-tauri-native-webview-companion-design.md`
**Plan**: `/home/lagz0ne/dev/kanna/docs/superpowers/plans/2026-04-02-tauri-native-webview-companion.md`

**Status**: Design approved. Plan written. Implementation started with the first milestone: Tauri shell scaffold + standard-port attach + initial native-webview protocol surface.

**Summary**: Research how to incorporate Tauri so controlled content uses native webviews instead of iframes. Approved direction is a small-scope Tauri shell where the Kanna UI is itself a Tauri-managed webview and controlled content lives in native peer webviews. Runtime coordination stays on NATS; first-cut bootstrap may use standard-port setup/self-discovery.

**Current decisions**:
1. Prefer hybrid architecture eventually, but start with a smaller-scope Tauri companion/shell.
2. Controlled content should support local and LAN/Tailscale targets first, with optional proxied remote targets later.
3. UX should support both docked and pop-out controlled webviews.
4. Kanna UI should be treated as another Tauri-managed webview, not the privileged root surface.
5. Runtime discovery/control should be NATS-first; avoid relying on HTTP for coordination.
6. First-cut bootstrap via standard local setup/self-discovery is acceptable.

**Next**:
1. Implement the Tauri shell scaffold.
2. Add shared native-webview protocol and tests.
3. Verify from WSL and document Windows run/build flow.

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

**Status**: Plan written. Waiting for execution mode selection.

**Summary**: Add a hold-to-reveal client-side overlay that shows curated, copyable `ui-id` labels for meaningful UI surfaces. While `Alt` + `Shift` is held, the hovered tagged surface reveals a short ancestor stack so users can reference either the exact component or the broader containing area in debug/LLM requests.

**Approved shape**:
1. Curated tags only, not automatic DOM-wide labeling.
2. Hold-only stack with nearest tagged surface first and up to 2 tagged ancestors above it.
3. Global app-level overlay controller with portal rendering and direct row-click copy.
4. First-release coverage focused on high-value chat/settings shells and major interaction surfaces.

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
