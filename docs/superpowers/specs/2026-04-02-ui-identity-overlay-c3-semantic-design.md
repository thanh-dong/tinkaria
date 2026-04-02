# UI Identity Overlay C3 Semantic IDs Design

Date: 2026-04-02
Status: Approved for planning

## Goal

Make copied UI identity payloads more meaningful for LLM-guided change requests by pairing each visible `ui-id` with a C3 architectural anchor. The overlay should remain readable on screen while copied output becomes precise enough to lead directly into the codemap.

## Core Decision

Use a split display/copy contract.

### Visible Label

Keep the visible overlay row label UI-readable:
- `chat.navbar.new-chat.action`
- `sidebar.chat-row.item`
- `chat.preferences.popover`

The on-screen label should optimize for fast scanning and low visual noise.

### Copied Payload

Use a hybrid copied payload:
- `chat.navbar.new-chat.action | c3:c3-112`
- `sidebar.chat-row.item | c3:c3-113`

When a stable component title is helpful and cheap to derive, allow the richer form:
- `chat.navbar.new-chat.action | c3:c3-112(chat-input)`

The copied payload should answer both:
- what visible UI surface is this?
- where does it belong architecturally?

## Why This Split

### Problem

Pure UI ids are readable but weak as architectural handles.

Example:
- `chat.navbar.new-chat.action`

This tells an LLM what the user clicked, but not which C3 component should own the change.

### Alternative Rejected

Showing raw C3-first strings directly in the overlay:
- `c3-112:chat.navbar.new-chat.action`

Rejected because:
- visually noisy
- harder to scan
- less useful as a hover aid

### Chosen Approach

Keep the overlay human-readable and make copy richer than display.

This preserves the fast hover/debug UX while making pasted references far more actionable in future prompts, issue reports, and C3-driven workflows.

## Mapping Model

Each tagged surface should be able to resolve to:
- `ui-id`
- `c3` component id
- optional component title/slug for readability

This can be represented as metadata attached to the same tagged DOM surface rather than inferred later from arbitrary DOM structure.

### Example Mappings

- `chat.navbar.new-chat.action` → `c3-112`
- `message.assistant.response` → `c3-111`
- `chat.sidebar` / `sidebar.chat-row.item` → `c3-113`
- `chat.terminal-workspace` → `c3-114`
- `chat.right-sidebar` → `c3-115`
- `settings.page` / `settings.general.section` → `c3-116`

## Helper Direction

The tagging helper layer should move from “raw string only” toward explicit metadata:

Possible direction:
- visible id
- kind
- c3 component id
- optional readable component label

The helper does not need to expose all metadata in every callsite immediately, but the system should make this mapping intentional and stable.

## Copy Semantics

### Default Copy

Clicking a row copies the hybrid payload:
- `ui-id | c3:<component-id>`

### Future Optional Enrichment

If the metadata is present:
- `ui-id | c3:<component-id>(<component-title>)`

Do not add more than this by default in the first pass. Avoid dumping file paths, refs, or long codemap text into the copied string.

## Display Semantics

The overlay row itself should continue to show only the UI-readable label by default.

Optional secondary treatment is allowed later:
- muted tiny suffix showing `c3-112`
- tooltip on hover

But the first pass should keep the row compact and readable.

## C3 Relationship

This change should connect directly to the C3 overlay thread:
- the copied payload should lead into C3 component lookup cleanly
- the eventual C3 rule/reference for UI identity placement should also define when a surface must carry a component mapping

The copied artifact is not a replacement for C3; it is a bridge into C3.

## Testing

Follow RED-GREEN-TDD.

Minimum coverage:
- helper output for split display/copy contracts
- copied payload formatting with `ui-id | c3:<id>`
- fallback behavior when a surface has no C3 mapping yet
- visible label remains clean while copy payload is richer

Verification:
- focused Bun tests
- browser smoke test that confirms copied text matches the hybrid contract
- `bun run build`
- `bunx @typescript/native-preview --noEmit -p tsconfig.json` with unchanged pre-existing failure documented if applicable
- `c3x check`

## Risks And Mitigations

### Risk: copied payload becomes noisy

Mitigation:
- keep display and copy separate
- limit first-pass copy output to `ui-id | c3:<id>`

### Risk: stale C3 mappings

Mitigation:
- attach mapping intentionally at tag sites
- document this in the C3 placement rule/reference
- fall back gracefully when a C3 id is not yet assigned

### Risk: partial rollout creates inconsistent copy behavior

Mitigation:
- allow temporary fallback to plain `ui-id` where no mapping exists
- prioritize the high-value surfaces already tagged in the first release

## Implementation Notes

- Existing overlay rendering can stay largely intact.
- The likely change point is the tag helper layer plus row copy formatting.
- This should be implemented before doing a wider interactable sweep, so the richer contract propagates consistently from the start.
