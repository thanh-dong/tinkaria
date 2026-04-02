# UI Identity Overlay Design

Date: 2026-04-02
Status: Approved for planning

## Goal

Add a hold-to-reveal UI identity overlay that makes important Kanna surfaces easier to reference in debugging and LLM-driven change requests. While the user holds `Alt` + `Shift`, hovered tagged surfaces should reveal a short, copyable identity stack that includes the nearest tagged surface and its tagged ancestors.

## Scope

This feature is client-side only.

In scope:
- A global overlay layer for the React SPA
- Curated `ui-id` tagging for high-value surfaces
- Hover-based tagged-surface resolution while `Alt` + `Shift` is held
- A copyable ancestor stack with bounded depth
- Visual bounds feedback for the currently highlighted row
- Focused tests for activation, resolution, stack behavior, copy, and teardown

Out of scope for first release:
- Auto-generated ids for arbitrary DOM nodes
- Exhaustive tagging of every UI primitive
- Persisted overlay state or user preferences
- Server changes

## Recommended Approach

Use a single app-level overlay controller rather than per-feature overlays.

Why:
- Key state, pointer tracking, ancestor resolution, viewport clamping, and copy behavior belong in one place.
- Curated tags stay stable even when implementation details or DOM structure shift.
- The feature remains additive and low-risk because feature components only opt in by adding tags to meaningful surfaces.

## Interaction Model

### Activation

- Overlay stays fully dormant until both `Alt` and `Shift` are held.
- Releasing either key removes the overlay immediately.
- The overlay should not interfere with existing keyboard behavior while inactive.

### Target Resolution

- Only explicitly tagged surfaces participate.
- When active, the controller resolves the nearest tagged ancestor of the current pointer target.
- If the pointer is over an untagged child inside a tagged surface, the containing tagged surface becomes the current target.
- If no tagged surface is found, the overlay stays hidden.

### Stack Behavior

- Row 1 is the nearest tagged surface.
- Additional rows are tagged ancestors only.
- Depth is capped to 3 total rows in the first release.
- Each row displays a stable `ui-id` string.

### Copy and Highlighting

- Clicking a row copies that row’s `ui-id` directly.
- The row being inspected should visibly map back to the page through a bounds highlight.
- After copy, the row should show brief inline confirmation such as `Copied`.
- The overlay should remain compact; per-row icon buttons are unnecessary unless testing shows accidental copy is a problem.

### Placement

- Render the stack near the active surface.
- Clamp overlay placement to the viewport to avoid off-screen rendering.
- Keep the overlay visually distinct from app content but small enough to avoid covering the whole area being inspected.

## Tagging Model

Use curated ids on meaningful UI surfaces only.

Initial tagging targets:
- App/page shells
- Chat page root and transcript region
- Message blocks
- Composer
- Left sidebar
- Right sidebar
- Terminal pane/workspace
- Chat navbar controls and major sections
- Settings page sections

Preferred API:
- A tiny wrapper or attribute-based helper that makes the intent explicit at call sites
- Stable dotted ids such as `chat.page`, `transcript.message-list`, `message.assistant.response`

Non-goals:
- Mirroring React component names
- Deriving ids from CSS selectors or DOM paths
- Tagging every nested primitive

## Architecture

### Overlay Controller

Create a client-side controller near the app shell that owns:
- Current modifier-key state
- Current pointer target
- Resolved tagged stack
- Overlay placement
- Temporary copy-confirmation state

This controller should render through a portal so the stack can float above feature layouts without feature-specific z-index coupling.

### Tagged Surface API

Provide a small reusable primitive for marking elements with `ui-id` metadata. Feature code should opt in declaratively by wrapping or annotating meaningful surfaces.

Requirements:
- Minimal markup overhead
- Works on existing semantic containers
- Exposes enough DOM metadata for ancestor resolution and bounds highlighting

### Styling

The overlay should fit Kanna’s existing visual language rather than introducing a separate debug theme. It should be readable on light and dark surfaces and preserve legibility over varied transcript content.

## Testing Strategy

Follow RED-GREEN-TDD.

Minimum targeted coverage:
- Activation only when both `Alt` and `Shift` are held
- Immediate teardown when either key is released
- Nearest tagged-surface resolution from nested untagged children
- Ancestor-stack construction and 3-row cap
- Copy behavior for a selected row
- Highlight target changes when different rows are inspected
- Hidden state when pointer is outside tagged surfaces

Verification after implementation:
- `bun test` for focused client tests
- `bun run build`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json`
- `c3x check`
- Browser smoke test with the live overlay

## Risks and Mitigations

### Risk: noisy or unstable ids

Mitigation:
- Start with curated high-value surfaces only.
- Keep ids explicit in code, not derived from incidental DOM structure.

### Risk: overlay conflicts with normal interactions

Mitigation:
- Keep the system dormant unless both modifiers are pressed.
- Avoid broad pointer capture.
- Limit click handling to overlay rows only.

### Risk: implementation spreads across too many features

Mitigation:
- Centralize behavior in one overlay controller.
- Treat feature work as opt-in tagging only.
- Start with a narrow first-release tag set and expand later.

## Implementation Notes For Planning

- The app shell is the likely owner for the global controller.
- Chat and settings surfaces provide the highest immediate value for first-release tags.
- The implementation should respect `rule-react-no-effects`; event listeners and DOM sync need to be structured as true external-boundary effects only where unavoidable.
