# Frontend Un-Effect Design

**Date:** 2026-04-02
**ADR:** `adr-20260402-eliminate-frontend-effect-violations-master-plan`
**Status:** Proposed

## Goal

Eliminate all currently-audited violations of `rule-react-no-effects` in `src/client` without destabilizing the allowed boundary hooks that legitimately synchronize React with external systems.

The result should leave Kanna with:
- no Effect-driven derived state or post-render state repair in the audited files
- no Effect-driven user workflow orchestration for queued chat submission
- explicit replacement patterns that match the repo rule: render derivation, keyed identity resets, event handlers, Zustand stores, and subscription boundaries

## Non-Goals

- Removing every remaining `useEffect` or `useLayoutEffect` from the repo regardless of purpose
- Replacing allowed boundary hooks such as browser subscriptions, `ResizeObserver`, xterm lifecycle wiring, or focused DOM/layout adapters
- Introducing TanStack Query
- Performing unrelated UI redesigns or large cross-cutting refactors outside the audited violations

## Scope

This design covers the known violation set from the frontend audit:

1. `src/client/app/useKannaState.ts`
2. `src/client/app/SettingsPage.tsx`
3. `src/client/components/chat-ui/ChatInput.tsx`
4. `src/client/components/NewProjectModal.tsx`
5. `src/client/components/ui/app-dialog.tsx`
6. `src/client/app/ChatPage.tsx`

It also covers any focused supporting changes required to remove the violations cleanly, including new client stores or small helper components/hooks.

## Current Problems

The audited violations fall into three technical buckets:

1. **State mirroring and post-render repair**
   `SettingsPage`, `ChatInput`, `NewProjectModal`, and `app-dialog` copy props/store values into local state after render with Effects.

2. **Effect-driven workflow orchestration**
   `useKannaState` uses Effects to coordinate queued message flush behavior and some derived selection transitions.

3. **Presentation-only Effect logic**
   `ChatPage` uses an Effect-based interval to drive the empty-state typing animation.

These patterns violate the rule because they model internal React state changes with post-commit synchronization rather than expressing ownership and transitions directly.

## Replacement Strategy

### 1. Shared Client Workflow State -> Zustand

Any browser-side state that coordinates multiple renders or multiple components should live in an explicit store instead of an Effect-driven local state machine.

This applies most strongly to queued follow-up submission behavior in `useKannaState`.

Design consequences:
- introduce or extend a focused Zustand store for queue/workflow coordination only if the existing local hook state cannot be expressed cleanly with direct event transitions
- prefer store actions that perform the full transition in one place over chains of `setState` plus Effect follow-up logic
- keep socket subscriptions and external transport wiring where they already belong

### 2. External Subscriptions Stay at Boundary Hooks

Allowed boundary hooks remain valid:
- socket subscriptions
- media-query listeners
- `ResizeObserver`
- xterm lifecycle
- focused DOM/layout synchronization

The design does not attempt to erase those boundaries. It keeps them isolated and prevents application logic from leaking into them.

### 3. Prop/Route Identity Resets -> Keyed Subtrees or Explicit Open-Time Initialization

Where state exists only to support an interactive draft or modal session:
- prefer keyed remounts when identity clearly changes
- otherwise initialize/reset state directly in the event that opens the UI

This applies to `NewProjectModal`, `app-dialog`, and the draft inputs in `SettingsPage`.

### 4. User-Caused Workflows -> Event Handlers

If a transition happens because the user clicked, submitted, opened, approved, or navigated, the transition should happen in the event path that caused it, not in an Effect watching for a condition to become true.

This governs:
- queued send flush transitions in `useKannaState`
- prompt/dialog initialization
- modal reset behavior

### 5. Presentation Animation -> Dedicated View Primitive

The empty-state typing behavior in `ChatPage` should be replaced with a presentation-focused primitive that does not rely on an Effect that repairs local state after render.

Acceptable outcomes:
- CSS-driven animation with static content
- a dedicated component keyed by chat identity
- render-time string slicing based on a single bounded view state primitive owned by the animation component

The key requirement is that the page component stops using a generic Effect to orchestrate the animation.

## Phased Execution Design

### Phase 1: State And Workflow Core

Targets:
- `src/client/app/useKannaState.ts`
- `src/client/components/chat-ui/ChatInput.tsx`
- `src/client/app/SettingsPage.tsx`
- optional new store/helper modules under `src/client/stores/` or `src/client/lib/`

Intent:
- remove Effect-driven queued flush orchestration from `useKannaState`
- remove Effect-driven locked composer mirroring in `ChatInput`
- remove Effect-driven draft mirroring in `SettingsPage`

Why first:
- this is the highest-risk logic
- later modal/presentation cleanup should build on the new state ownership model, not compete with it

### Phase 2: Modal And Dialog Identity Cleanup

Targets:
- `src/client/components/NewProjectModal.tsx`
- `src/client/components/ui/app-dialog.tsx`

Intent:
- replace Effect-driven reset/seed behavior with keyed identity or explicit open-time initialization
- keep focus management only where it remains a true DOM boundary concern

Why second:
- once Phase 1 establishes the preferred ownership patterns, these become small and mechanical

### Phase 3: Presentation Cleanup

Targets:
- `src/client/app/ChatPage.tsx`

Intent:
- remove the empty-state typing Effect
- preserve the current user-facing feel, or simplify it if the effect-free version is materially cleaner

Why third:
- this slice is isolated and should not block the higher-value state/workflow cleanup

### Phase 4: Re-Audit And Enforcement

Targets:
- audited files above
- `tasks/todo.md`
- C3 audit notes if needed

Intent:
- rerun the frontend rule audit
- confirm every originally identified violation is removed or intentionally reclassified as an allowed boundary Effect
- verify no new violations were introduced

## File Structure Direction

Expected touched files for the master effort:

- Modify: `src/client/app/useKannaState.ts`
- Modify: `src/client/app/useKannaState.test.ts`
- Modify: `src/client/components/chat-ui/ChatInput.tsx`
- Modify: `src/client/components/chat-ui/ChatInput.test.ts`
- Modify: `src/client/app/SettingsPage.tsx`
- Modify: `src/client/app/SettingsPage.test.tsx`
- Modify: `src/client/components/NewProjectModal.tsx`
- Modify or add tests near the modal if coverage is missing
- Modify: `src/client/components/ui/app-dialog.tsx`
- Modify or add tests for dialog provider behavior if coverage is missing
- Modify: `src/client/app/ChatPage.tsx`
- Modify: `src/client/app/ChatPage.test.ts`
- Possibly create: one focused Zustand store or helper module under `src/client/stores/` or `src/client/lib/`

Constraint:
- do not scatter queue/workflow ownership across multiple new stores unless the current file proves too large to reason about safely
- any new store must have one clear responsibility and focused selectors/actions

## Behavioral Requirements

### useKannaState

- Keep current queue behavior intact:
  - busy submit queues text
  - idle transition flushes queued text
  - failed flush restores queued text deterministically
  - no cross-chat leakage
- Remove Effect-based orchestration for the queue state machine
- Remove Effect-driven selected project repair when a direct derivation or event-owned update can express the same behavior
- Preserve existing socket subscription semantics and transcript hydration behavior

### ChatInput

- Preserve auto-resize and focus behavior
- Remove Effect-driven `lockedComposerState` synchronization
- Keep provider locking semantics intact for active provider sessions

### SettingsPage

- Preserve draft-edit UX for terminal settings, editor command, and keybindings
- Remove the four Effects that mirror store/router values into draft state
- Ensure drafts reset at the correct identity boundary and do not overwrite in-progress edits unexpectedly

### NewProjectModal

- Preserve reset-on-open behavior
- Preserve focus-on-open and focus-on-tab-switch behavior
- Remove Effect-driven state reset from `open`

### AppDialogProvider

- Preserve `confirm`, `prompt`, and `alert` APIs
- Preserve autofocus/select behavior for prompts
- Remove Effect-driven prompt input seeding if the same behavior can be expressed by dialog identity or explicit open-time initialization

### ChatPage

- Preserve an intentional empty-state experience
- Remove the Effect-driven typing interval from the page component

## Testing Strategy

Every phase uses RED-GREEN-TDD.

Required verification shape:
- write or update focused tests for the specific behavior before refactoring
- verify the old pattern fails or is unsupported by the new target behavior
- implement the minimal effect-free replacement
- rerun targeted tests

Minimum verification set by the end of the full effort:
- `bun test src/client/app/useKannaState.test.ts`
- `bun test src/client/components/chat-ui/ChatInput.test.ts`
- `bun test src/client/app/SettingsPage.test.tsx`
- `bun test src/client/app/ChatPage.test.ts`
- any focused new modal/dialog tests added during implementation
- `bun run build`
- `c3x check`
- final rule re-audit over `src/client`

If a behavioral replacement changes user-visible animation rather than logic, prefer a focused render/assertion test over brittle timing-heavy tests unless timing itself is the product requirement.

## Risks

1. `useKannaState` currently bundles subscriptions, transcript hydration, navigation, and queue coordination in one file. Removing workflow Effects without careful tests could regress follow-up prompt staging.
2. `SettingsPage` drafts may currently rely on effect mirroring to absorb external store updates. The replacement must preserve predictable reset boundaries.
3. Focus behavior in modals/dialogs is easy to regress if reset and focus concerns are not separated cleanly.
4. A too-ambitious “remove every Effect” pass could accidentally target allowed boundary hooks and create worse abstractions than the current code.

## Mitigations

- Keep the scope limited to audited violations
- Land the work in phases with independent verification
- Preserve allowed boundary hooks unless they are directly entangled with a violation
- Prefer explicit ownership changes over clever abstractions

## Success Criteria

The master effort is complete only when all of the following are true:

1. Every currently-audited violation is removed from the target files.
2. Remaining Effects in those files are boundary-only and defensible under `rule-react-no-effects`.
3. Targeted Bun tests pass.
4. `bun run build` passes.
5. `c3x check` passes.
6. A final frontend audit can report no remaining confirmed violations in the scoped files.
