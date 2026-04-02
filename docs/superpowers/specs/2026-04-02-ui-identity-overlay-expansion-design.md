# UI Identity Overlay Expansion Design

Date: 2026-04-02
Status: Approved for planning

## Goal

Expand the Alt+Shift UI identity overlay from a shell-level debug aid into a practical visual-debug system that can address most visible UI on screen. The expansion should add a stable tagging taxonomy, broader visible-surface coverage, deeper action/menu coverage on chat and sidebar, and overlay placement that stays near the pointer instead of drifting away at screen edges.

## Scope

In scope:
- A hybrid `ui-id` taxonomy for persistent and transient surfaces
- A small helper layer for typed tag intent such as `area`, `item`, `action`, `menu`, `dialog`, and `popover`
- Broader area/item coverage across chat, sidebar, settings, terminal, dialogs, menus, and popovers
- Deeper action/menu coverage for chat and sidebar first
- Pointer-near overlay placement with viewport-aware flipping and clamping
- Continued selected-area halo support for the currently highlighted row
- Focused tests and browser smoke verification

Out of scope for this pass:
- Automatic tagging of arbitrary DOM nodes
- Exhaustive instrumentation of every nested primitive
- Server-side changes
- Replacing curated tags with generated selectors

## Taxonomy

Use a hybrid naming model.

### Persistent Surfaces

Persistent visible surfaces use `component + kind`:
- `chat.page.area`
- `chat.navbar.area`
- `chat.navbar.new-chat.action`
- `chat.composer.area`
- `sidebar.chat-row.item`
- `settings.general.section`

### Transient Surfaces

Transient rendered surfaces use explicit suffixes:
- `sidebar.chat-row.menu`
- `sidebar.project-group.menu`
- `chat.preferences.popover`
- `project.remove.dialog`

### Rules

- `area` is for broad, visible regions users may describe semantically.
- `item` is for repeatable list/grid entries.
- `action` is for directly clickable controls.
- `menu`, `dialog`, and `popover` are for transient content roots.
- Avoid decorative wrapper tags unless the wrapper is itself the useful hover surface.

## Placement

The overlay should stay close to the cursor, not the far edge of the target element.

### Pointer Bias

- Use the live pointer position as the overlay anchor.
- The selected-area halo still follows the selected element bounds.

### Viewport-Aware Placement

- Prefer opening slightly to the right and below the cursor when there is room.
- Near the right edge, flip to the left instead of forcing a long travel.
- Near the bottom edge, flip above instead of rendering off-screen.
- If space is tight on both sides, clamp inside the viewport while keeping the panel as close to the cursor as possible.

### Interaction Goal

The cursor should be able to move from the current hover point into the overlay with a short, predictable motion, especially near bottom-right UI such as chat composer controls and model selectors.

## Coverage Strategy

### Closest Useful Context

The overlay should prefer the closest useful visible context, not the deepest render node.

This means:
- broad visible content roots should be grab-worthy by default
- pane-level alternates are useful when they represent clearly different visible contexts
- deep artifact-level tagging should stay optional and should not be the default path

Good defaults:
- `rich-content.viewer.area`
- `content-review.panel.area`
- `review.diff.area`
- `rich-content.preview.area`
- `rich-content.source.area`

Usually avoid:
- `rich-content.svg.embed`
- `review.diff.hunk.item`
- renderer-internal wrappers that do not improve follow-up context

### Breadth Everywhere

Add broad `area`/`item` coverage for most visible on-screen surfaces:
- chat page regions
- sidebar sections and rows
- settings sections
- terminal workspace regions
- rich-content viewers and content-preview surfaces
- review and diff panels inside enriched modal/content-review flows
- dialog roots
- dropdown, popover, and context-menu content roots

### Depth On Chat And Sidebar First

Chat first:
- navbar actions
- composer controls
- preference selectors and popovers
- visible message interaction surfaces

Sidebar first:
- project group headers
- chat row items
- chat row menus
- project group menus
- visible section actions

### Later Depth

Settings and terminal should receive broad section/item coverage now, with finer action-level tagging later if needed.

Rich content and review surfaces should follow a root-first rule:
- tag the viewer or review root by default
- add pane-level alternates only when preview, source, diff, or similar areas are visually distinct and useful in prompts
- do not require per-artifact tagging unless a later pass proves it is necessary

## Tag Placement Rule

Tag where the user perceives and interacts, not where the DOM happens to be easy to patch.

Preferred order:
1. actual hover/click surface
2. stable semantic container
3. nearest visible wrapper

When multiple tagged candidates exist, prefer the one that best answers "what visible context am I referring to?" rather than the deepest implementation detail.

Avoid:
- purely structural wrappers
- layout-only nesting layers
- duplicate tags on parent and child when only one is meaningful
- deep renderer-specific tags when a broader visible content root already gives enough context

Transient content rule:
- menus, popovers, and dialogs must be tagged at the rendered content root, not only at the trigger.

## Helper Layer

Move toward a tiny helper API rather than raw ad hoc `data-ui-id` strings at every callsite.

Desired direction:
- helper functions or typed wrappers that express tag kind intentionally
- consistent mapping from semantic purpose to `ui-id`
- minimal callsite noise

The helper does not need to hide `data-ui-id`; it needs to standardize intent and naming.

## Testing

Follow RED-GREEN-TDD.

Minimum coverage:
- taxonomy helper outputs
- overlay placement near cursor with flip/clamp behavior
- halo selection remains tied to selected element bounds
- tagged sidebar row/project group/menu placement
- tagged chat action/popover placement for the first refined interactables

Verification:
- focused Bun tests for new helpers and placement
- `bun run build`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json` with pre-existing failures documented if unchanged
- `c3x check`
- browser smoke test across chat, sidebar, settings, and at least one transient menu/popover

## C3 Follow-Up

This expansion should produce a repo-specific C3 rule or reference for UI identity placement.

The rule/reference should cover:
- hybrid taxonomy
- area vs item vs action semantics
- transient surface tagging
- placement on visible semantic surfaces
- anti-patterns to avoid

## Risks And Mitigations

### Risk: id sprawl

Mitigation:
- keep taxonomy small and explicit
- prefer meaningful visible surfaces only
- expand screen-by-screen rather than all at once

### Risk: inconsistent naming

Mitigation:
- codify naming in a helper layer plus C3 rule/reference
- use suffixes consistently for transient content

### Risk: overlay still feels slippery near edges

Mitigation:
- use pointer-biased placement
- flip/clamp both horizontally and vertically
- preserve the short pointer handoff delay already added

## Implementation Notes

- Existing shell-level overlay infrastructure remains valid.
- The next pass should focus on chat/sidebar interactables first because they have the highest density of user-targeted controls.
- The selected-area halo should remain additive and visually distinct from the floating stack.
