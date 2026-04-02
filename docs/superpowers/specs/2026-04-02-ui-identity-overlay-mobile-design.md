# UI Identity Overlay Mobile Design

Date: 2026-04-02
Status: Approved for planning

## Goal

Add a mobile trigger and interaction model for the UI identity overlay so touch devices can inspect, copy, and reference visible UI surfaces without keyboard modifiers.

## Trigger

Use a two-finger long press on a tagged surface.

Why:
- low accidental activation rate
- avoids persistent debug chrome
- does not conflict as directly with standard single-finger taps
- maps well to “inspect this area”

## Interaction Model

### Entry

- A two-finger long press on a tagged surface enters mobile inspect mode.
- The initial selected target is the nearest tagged surface resolved from the touch origin.
- The selected-area halo appears immediately on that target.
- The overlay opens near the touch origin with the same ancestor stack used on desktop.

### Active Mode

- Mobile inspect mode is sticky.
- It remains open after the user lifts their fingers.
- The user can:
  - tap rows to copy ids
  - tap other tagged surfaces to retarget
  - drag across tagged surfaces if supported cleanly by the gesture model

### Dismissal

Dismiss explicitly by:
- tapping outside the overlay
- tapping a close pill/button on the overlay
- using system back behavior where applicable

Do not rely on a short timeout for dismissal.

## Shared Semantics

Mobile uses the same core model as desktop:
- same `ui-id` taxonomy
- same ancestor stack
- same selected-area halo
- same curated surface coverage

Only the trigger and session model differ:
- Desktop: hold-to-peek
- Mobile: enter inspect mode

## Conflict Rules

- Two-finger long press should not trigger ordinary navigation.
- While inspect mode is active, interaction with underlying UI should be suppressed enough to prevent accidental route changes or destructive taps.
- Single-finger scrolling outside inspect mode remains unchanged.
- Single-finger long press should remain available for native/app behaviors where already used.

## UX Expectations

- Inspect mode must feel deliberate, not hidden-but-fragile.
- The overlay should include a visible close affordance on mobile.
- The cursor-near placement rule becomes touch-origin-near placement on mobile.
- The selected-area halo must remain readable over dense UI.

## Testing

Follow RED-GREEN-TDD.

Minimum coverage:
- two-finger long press enters inspect mode
- inspect mode remains open after touch release
- tap outside closes inspect mode
- close affordance closes inspect mode
- selected-area halo remains tied to the current target
- underlying navigation/actions do not fire while inspect mode is active

Verification:
- focused client tests for touch-mode state transitions
- browser/device emulation smoke test for mobile viewport behavior
- `bun run build`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json` with pre-existing failures documented if unchanged
- `c3x check`

## C3 Follow-Up

This mobile addition belongs under the existing UI identity overlay ADR thread and should extend the same rule/reference set for surface taxonomy and placement.
