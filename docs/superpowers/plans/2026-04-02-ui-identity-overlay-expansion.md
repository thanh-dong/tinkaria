# UI Identity Overlay Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Alt+Shift UI identity overlay so most visible UI surfaces are addressable with a stable hybrid taxonomy, cursor-near placement, and deeper chat/sidebar interactable coverage.

**Architecture:** Keep the existing global overlay controller and portal, but standardize `ui-id` semantics through a small helper layer and broader surface tagging. The overlay continues to use pointer-biased placement and a selected-area halo, while visible persistent surfaces use `component + kind` ids and transient surfaces use explicit suffixes like `.menu`, `.dialog`, and `.popover`.

**Tech Stack:** React 19, TypeScript, Bun test, React DOM portal APIs, existing Tailwind utility styling, C3 architecture metadata

---

### Task 1: Add Typed UI Identity Helpers

**Files:**
- Modify: `src/client/lib/uiIdentityOverlay.ts`
- Test: `src/client/lib/uiIdentityOverlay.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import {
  createUiIdentity,
  getUiIdentityAttributeProps,
} from "./uiIdentityOverlay"

describe("createUiIdentity", () => {
  test("builds persistent and transient ids with the hybrid taxonomy", () => {
    expect(createUiIdentity("chat.navbar", "area")).toBe("chat.navbar.area")
    expect(createUiIdentity("sidebar.chat-row", "item")).toBe("sidebar.chat-row.item")
    expect(createUiIdentity("sidebar.chat-row", "menu")).toBe("sidebar.chat-row.menu")
    expect(createUiIdentity("chat.preferences", "popover")).toBe("chat.preferences.popover")
  })
})

describe("getUiIdentityAttributeProps", () => {
  test("accepts ids produced by the hybrid helper", () => {
    expect(getUiIdentityAttributeProps(createUiIdentity("chat.navbar", "action"))).toEqual({
      "data-ui-id": "chat.navbar.action",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/lib/uiIdentityOverlay.test.ts`
Expected: FAIL because `createUiIdentity()` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type UiIdentityKind =
  | "area"
  | "item"
  | "action"
  | "menu"
  | "dialog"
  | "popover"
  | "section"

export function createUiIdentity(base: string, kind: UiIdentityKind): string {
  return `${base}.${kind}`
}
```

Keep `getUiIdentityAttributeProps()` unchanged except for using the new helper at call sites later.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/lib/uiIdentityOverlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/uiIdentityOverlay.ts src/client/lib/uiIdentityOverlay.test.ts
git commit -m "feat: add typed ui identity helpers"
```

### Task 2: Finish Cursor-Near Placement Rules

**Files:**
- Modify: `src/client/components/ui/UiIdentityOverlay.tsx`
- Test: `src/client/components/ui/UiIdentityOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

Extend the existing overlay placement tests:

```ts
import { describe, expect, test } from "bun:test"
import { getUiIdentityOverlayPanelPosition } from "./UiIdentityOverlay"

describe("getUiIdentityOverlayPanelPosition", () => {
  test("places the panel to the left when the cursor is near the right edge", () => {
    expect(getUiIdentityOverlayPanelPosition({
      anchorRect: { top: 220, left: 1260, right: 1260, bottom: 220, width: 0, height: 0 },
      rowCount: 3,
      viewport: { width: 1280, height: 800 },
    })).toEqual({
      top: 230,
      left: 1026,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/ui/UiIdentityOverlay.test.tsx`
Expected: FAIL because the current helper clamps rightward instead of preferring the nearer reachable side.

- [ ] **Step 3: Write minimal implementation**

Update the placement helper so horizontal placement mirrors the vertical rule:

```ts
const preferredLeft = args.anchorRect.left + UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX
const flippedLeft = args.anchorRect.left - UI_IDENTITY_OVERLAY_PANEL_MIN_WIDTH_PX - UI_IDENTITY_OVERLAY_PANEL_CURSOR_OFFSET_PX
const maxLeft = args.viewport.width - UI_IDENTITY_OVERLAY_PANEL_MIN_WIDTH_PX - UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX
const left = preferredLeft <= maxLeft
  ? preferredLeft
  : Math.max(UI_IDENTITY_OVERLAY_PANEL_VIEWPORT_MARGIN_PX, flippedLeft)
```

Keep the existing vertical flip/clamp logic intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/ui/UiIdentityOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ui/UiIdentityOverlay.tsx src/client/components/ui/UiIdentityOverlay.test.tsx
git commit -m "feat: refine ui identity overlay placement"
```

### Task 3: Expand Chat Interactable Coverage

**Files:**
- Modify: `src/client/components/chat-ui/ChatNavbar.tsx`
- Modify: `src/client/components/chat-ui/ChatInput.tsx`
- Modify: `src/client/components/chat-ui/ChatPreferenceControls.tsx`
- Modify: `src/client/app/ChatPage.test.ts`

- [ ] **Step 1: Write the failing test**

Add focused render-level assertions in `src/client/app/ChatPage.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatNavbar } from "../components/chat-ui/ChatNavbar"
import { ChatPreferenceControls } from "../components/chat-ui/ChatPreferenceControls"

describe("chat interactable ui ids", () => {
  test("renders curated navbar action ids", () => {
    const markup = renderToStaticMarkup(
      <ChatNavbar
        sidebarCollapsed={false}
        onOpenSidebar={() => {}}
        onExpandSidebar={() => {}}
        onNewChat={() => {}}
        onToggleEmbeddedTerminal={() => {}}
        onToggleRightSidebar={() => {}}
      />
    )

    expect(markup).toContain("chat.navbar.area")
    expect(markup).toContain("chat.navbar.new-chat.action")
    expect(markup).toContain("chat.navbar.terminal-toggle.action")
    expect(markup).toContain("chat.navbar.right-sidebar-toggle.action")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/ChatPage.test.ts`
Expected: FAIL because the specific action ids do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Use `createUiIdentity()` plus `getUiIdentityAttributeProps()` at stable visible controls:

```tsx
const CHAT_NAVBAR_IDS = {
  area: createUiIdentity("chat.navbar", "area"),
  newChat: createUiIdentity("chat.navbar.new-chat", "action"),
  terminalToggle: createUiIdentity("chat.navbar.terminal-toggle", "action"),
  rightSidebarToggle: createUiIdentity("chat.navbar.right-sidebar-toggle", "action"),
}
```

Apply them to:
- `CardHeader` root
- compose button
- terminal toggle button
- right sidebar toggle button

In `ChatPreferenceControls.tsx`, tag the visible popover triggers and popover content roots using explicit `.action` / `.popover` ids.

In `ChatInput.tsx`, tag the main composer control region and the primary submit/cancel actions if they are visible independently.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/ChatPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/chat-ui/ChatNavbar.tsx src/client/components/chat-ui/ChatInput.tsx src/client/components/chat-ui/ChatPreferenceControls.tsx src/client/app/ChatPage.test.ts
git commit -m "feat: expand chat ui identity coverage"
```

### Task 4: Expand Sidebar Item And Menu Coverage

**Files:**
- Modify: `src/client/components/chat-ui/sidebar/ChatRow.tsx`
- Modify: `src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx`
- Modify: `src/client/components/chat-ui/sidebar/Menus.tsx`
- Modify: `src/client/components/ui/context-menu.tsx`
- Modify: `src/client/components/ui/dropdown-menu.tsx`
- Modify: `src/client/app/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add focused assertions in `src/client/app/App.test.tsx`:

```ts
describe("sidebar ui identity coverage", () => {
  test("renders curated ids on row items and menu content", () => {
    const chatRowHtml = renderToStaticMarkup(
      <ChatRow ... />
    )

    expect(chatRowHtml).toContain("sidebar.chat-row.item")
    expect(chatRowHtml).toContain("sidebar.chat-row.menu")
  })
})
```

Add pure primitive tests:

```ts
import { getDropdownMenuContentUiIdentityProps } from "../components/ui/dropdown-menu"
import { getContextMenuContentUiIdentityProps } from "../components/ui/context-menu"

expect(getDropdownMenuContentUiIdentityProps("sidebar.chat-row.menu")).toEqual({
  "data-ui-id": "sidebar.chat-row.menu",
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/App.test.tsx`
Expected: FAIL because the refined item/menu ids do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Apply hybrid ids:

```tsx
// ChatRow.tsx
<div {...getUiIdentityAttributeProps(createUiIdentity("sidebar.chat-row", "item"))} ...>
```

```tsx
// LocalProjectsSection.tsx
<div {...getUiIdentityAttributeProps(createUiIdentity("sidebar.project-group", "item"))} ...>
```

```tsx
// Menus.tsx
<DropdownMenuContent uiId={createUiIdentity("sidebar.chat-row", "menu")} ...>
<ContextMenuContent uiId={createUiIdentity("sidebar.project-group", "menu")} ...>
```

Add pass-through helpers in the Radix wrappers:

```tsx
export function getDropdownMenuContentUiIdentityProps(uiId?: string) {
  return uiId ? { "data-ui-id": uiId } : {}
}
```

Use the same pattern for `ContextMenuContent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/chat-ui/sidebar/ChatRow.tsx src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx src/client/components/chat-ui/sidebar/Menus.tsx src/client/components/ui/context-menu.tsx src/client/components/ui/dropdown-menu.tsx src/client/app/App.test.tsx
git commit -m "feat: expand sidebar ui identity coverage"
```

### Task 5: Add The C3 Tag Placement Rule And Final Verification

**Files:**
- Modify: `tasks/todo.md`
- Modify: `.c3/c3.db` via `c3x` commands

- [ ] **Step 1: Write the failing audit target**

Use the existing expansion spec as the source of truth and identify the missing C3 artifact:

```bash
bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh query "ui identity placement taxonomy" --json
```

Expected: no existing dedicated rule/reference covering the new taxonomy.

- [ ] **Step 2: Create the C3 rule/reference**

Run:

```bash
bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh add rule ui-identity-placement
```

Then populate the rule goal/body so it covers:
- hybrid taxonomy
- `area` / `item` / `action` semantics
- transient `.menu` / `.dialog` / `.popover`
- tag visible semantic surfaces, not decorative wrappers
- cursor-near placement expectations for overlay triggers where relevant

- [ ] **Step 3: Run the full verification set**

Run:

```bash
bun test src/client/lib/uiIdentityOverlay.test.ts src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts
bun run build
bunx @typescript/native-preview --noEmit -p tsconfig.json
bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
agent-browser open http://localhost:5174/chat/<known-chat-id>
agent-browser errors
```

Smoke-test checklist:
- Alt+Shift over chat navbar, composer controls, and sidebar rows shows nearby overlay
- overlay flips/clamps near bottom-right controls instead of escaping off-screen
- selected-area halo matches the highlighted row
- chat-row and project-group menus show their transient ids when opened
- settings and sidebar shell tags still work

- [ ] **Step 4: Update handoff**

Record in `tasks/todo.md`:
- completed interactable/tag taxonomy expansion
- exact verification commands run
- browser smoke-test findings
- any remaining uncovered surfaces to sweep later

- [ ] **Step 5: Commit**

```bash
git add tasks/todo.md
git commit -m "docs: record ui identity overlay expansion verification"
```

## Self-Review

Spec coverage:
- Hybrid taxonomy is implemented in Task 1 and enforced through later call sites.
- Pointer-near, flip/clamp placement is covered in Task 2.
- Broad visible-surface coverage plus deeper chat/sidebar interactables are covered in Tasks 3 and 4.
- The required C3 placement guidance and final verification are covered in Task 5.

Placeholder scan:
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes concrete files, code, commands, and expected outcomes.

Type consistency:
- Shared terms remain `createUiIdentity()`, `getUiIdentityAttributeProps()`, `getUiIdentityOverlayPanelPosition()`, and the hybrid suffixes `area`, `item`, `action`, `menu`, `dialog`, `popover`.
