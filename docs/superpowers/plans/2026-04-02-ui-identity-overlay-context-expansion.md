# UI Identity Overlay Context Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Alt+Shift UI identity overlay so most visible content surfaces are grab-worthy, and copied ids carry a C3 bridge without making the on-screen overlay noisy.

**Architecture:** Keep the existing global overlay controller and floating panel, but extend the tag metadata model from a raw `data-ui-id` string into a richer visible-label plus copied-payload contract. Tag broad visible roots first, allow a few pane-level alternates where they improve context, and sweep rich-content/review surfaces before deeper interactable internals.

**Tech Stack:** React 19, TypeScript, Bun test, React DOM portal APIs, existing client overlay helpers, C3 metadata conventions, agent-browser smoke verification

---

### Task 1: Add C3-Aware Overlay Metadata Helpers

**Files:**
- Modify: `src/client/lib/uiIdentityOverlay.ts`
- Test: `src/client/lib/uiIdentityOverlay.test.ts`

- [ ] **Step 1: Write the failing test**

Add helper-level tests for visible/copy split and fallback behavior:

```ts
import { describe, expect, test } from "bun:test"
import {
  createUiIdentityDescriptor,
  formatCopiedUiIdentity,
  getUiIdentityAttributeProps,
} from "./uiIdentityOverlay"

describe("createUiIdentityDescriptor", () => {
  test("stores visible id and c3 component metadata together", () => {
    expect(createUiIdentityDescriptor({
      id: "rich-content.viewer.area",
      c3ComponentId: "c3-111",
    })).toEqual({
      id: "rich-content.viewer.area",
      c3ComponentId: "c3-111",
      c3ComponentLabel: null,
    })
  })
})

describe("formatCopiedUiIdentity", () => {
  test("formats hybrid copied payloads when c3 metadata exists", () => {
    expect(formatCopiedUiIdentity({
      id: "rich-content.viewer.area",
      c3ComponentId: "c3-111",
      c3ComponentLabel: null,
    })).toBe("rich-content.viewer.area | c3:c3-111")
  })

  test("falls back to the visible id when c3 metadata is absent", () => {
    expect(formatCopiedUiIdentity({
      id: "review.diff.area",
      c3ComponentId: null,
      c3ComponentLabel: null,
    })).toBe("review.diff.area")
  })
})

describe("getUiIdentityAttributeProps", () => {
  test("writes data attributes for visible and copied metadata", () => {
    expect(getUiIdentityAttributeProps(createUiIdentityDescriptor({
      id: "chat.navbar.area",
      c3ComponentId: "c3-112",
      c3ComponentLabel: "chat-input",
    }))).toEqual({
      "data-ui-id": "chat.navbar.area",
      "data-ui-c3": "c3-112",
      "data-ui-c3-label": "chat-input",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/lib/uiIdentityOverlay.test.ts`
Expected: FAIL because the descriptor and copied-payload helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a small metadata contract in `src/client/lib/uiIdentityOverlay.ts`:

```ts
export interface UiIdentityDescriptor {
  id: string
  c3ComponentId: string | null
  c3ComponentLabel: string | null
}

export function createUiIdentityDescriptor(args: {
  id: string
  c3ComponentId?: string | null
  c3ComponentLabel?: string | null
}): UiIdentityDescriptor {
  return {
    id: args.id,
    c3ComponentId: args.c3ComponentId ?? null,
    c3ComponentLabel: args.c3ComponentLabel ?? null,
  }
}

export function formatCopiedUiIdentity(descriptor: UiIdentityDescriptor): string {
  if (!descriptor.c3ComponentId) {
    return descriptor.id
  }

  if (descriptor.c3ComponentLabel) {
    return `${descriptor.id} | c3:${descriptor.c3ComponentId}(${descriptor.c3ComponentLabel})`
  }

  return `${descriptor.id} | c3:${descriptor.c3ComponentId}`
}
```

Keep the existing string helper path working by allowing `getUiIdentityAttributeProps()` to accept either a string id or a `UiIdentityDescriptor`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/lib/uiIdentityOverlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/uiIdentityOverlay.ts src/client/lib/uiIdentityOverlay.test.ts
git commit -m "feat: add c3 aware ui identity metadata"
```

### Task 2: Teach The Overlay To Copy Richer Payloads Without Changing Visible Labels

**Files:**
- Modify: `src/client/app/App.tsx`
- Modify: `src/client/components/ui/UiIdentityOverlay.tsx`
- Test: `src/client/app/App.test.tsx`
- Test: `src/client/components/ui/UiIdentityOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

Add focused tests that lock the visible/copy split:

```ts
import { describe, expect, test } from "bun:test"
import { getUiIdentityStackRows } from "./App"

describe("getUiIdentityStackRows", () => {
  test("keeps visible labels clean while exposing richer copied payloads", () => {
    expect(getUiIdentityStackRows([
      {
        id: "rich-content.viewer.area",
        c3ComponentId: "c3-111",
        c3ComponentLabel: null,
      },
    ])).toEqual([
      {
        visibleLabel: "rich-content.viewer.area",
        copiedValue: "rich-content.viewer.area | c3:c3-111",
      },
    ])
  })
})
```

In `src/client/components/ui/UiIdentityOverlay.test.tsx`, assert the overlay renders only the visible label text:

```ts
expect(screen.getByText("rich-content.viewer.area")).toBeTruthy()
expect(screen.queryByText(/c3:c3-111/)).toBeNull()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/App.test.tsx src/client/components/ui/UiIdentityOverlay.test.tsx`
Expected: FAIL because stack rows only know about a plain `ui-id` string today.

- [ ] **Step 3: Write minimal implementation**

In `src/client/app/App.tsx`:

```ts
interface UiIdentityStackRow {
  visibleLabel: string
  copiedValue: string
  element: HTMLElement
}
```

Build rows from DOM metadata instead of a single raw string:
- read `data-ui-id`, `data-ui-c3`, and `data-ui-c3-label`
- use `formatCopiedUiIdentity()` to produce the copied value
- keep the row label equal to `data-ui-id`

In `src/client/components/ui/UiIdentityOverlay.tsx`:
- keep row rendering bound to `visibleLabel`
- keep copy action bound to `copiedValue`
- do not introduce visible C3 noise in the list item body

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/App.test.tsx src/client/components/ui/UiIdentityOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app/App.tsx src/client/app/App.test.tsx src/client/components/ui/UiIdentityOverlay.tsx src/client/components/ui/UiIdentityOverlay.test.tsx
git commit -m "feat: split overlay labels from copied ids"
```

### Task 3: Tag Broad Visible Rich-Content And Review Roots

**Files:**
- Modify: `src/client/components/rich-content/RichContentBlock.tsx`
- Modify: `src/client/components/rich-content/ContentOverlay.tsx`
- Modify: `src/client/components/rich-content/EmbedRenderer.tsx`
- Modify: `src/client/components/messages/LocalFilePreviewDialog.tsx`
- Modify: `src/client/components/messages/PresentContentMessage.tsx`
- Test: `src/client/components/rich-content/RichContentBlock.test.tsx`
- Test: `src/client/components/rich-content/ContentOverlay.test.tsx`
- Test: `src/client/components/messages/LocalFilePreviewDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Add root-first coverage tests for visible content viewers:

```ts
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { RichContentBlock } from "./RichContentBlock"

describe("RichContentBlock ui identity coverage", () => {
  test("tags the viewer root with a broad visible-content id", () => {
    const markup = renderToStaticMarkup(
      <RichContentBlock
        language="markdown"
        value={"# Title"}
      />
    )

    expect(markup).toContain("rich-content.viewer.area")
  })
})
```

In `ContentOverlay.test.tsx`, assert broad pane-level alternates only when there are distinct panes:

```ts
expect(markup).toContain("content-review.panel.area")
expect(markup).toContain("review.diff.area")
```

In `LocalFilePreviewDialog.test.tsx`, assert the dialog content root is grab-worthy:

```ts
expect(markup).toContain("content-preview.dialog")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/rich-content/ContentOverlay.test.tsx src/client/components/messages/LocalFilePreviewDialog.test.tsx`
Expected: FAIL because these visible content roots are not tagged yet.

- [ ] **Step 3: Write minimal implementation**

Apply descriptor-based tags to broad visible surfaces:

```tsx
const RICH_CONTENT_VIEWER_ID = createUiIdentityDescriptor({
  id: "rich-content.viewer.area",
  c3ComponentId: "c3-111",
})
```

Add similar descriptors for:
- `content-review.panel.area`
- `review.diff.area`
- `content-preview.dialog`

Rules:
- tag the viewer/review root first
- add pane-level alternates only when the UI already presents separate visible panes such as preview vs source or review panel vs diff body
- do not tag renderer-internal artifact nodes like `svg` embeds by default

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/rich-content/ContentOverlay.test.tsx src/client/components/messages/LocalFilePreviewDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/rich-content/RichContentBlock.tsx src/client/components/rich-content/ContentOverlay.tsx src/client/components/rich-content/EmbedRenderer.tsx src/client/components/messages/LocalFilePreviewDialog.tsx src/client/components/messages/PresentContentMessage.tsx src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/rich-content/ContentOverlay.test.tsx src/client/components/messages/LocalFilePreviewDialog.test.tsx
git commit -m "feat: tag rich content review surfaces"
```

### Task 4: Sweep Remaining Broad Visible Surfaces Across Chat, Sidebar, Terminal, And Settings

**Files:**
- Modify: `src/client/app/ChatPage.tsx`
- Modify: `src/client/app/TinkariaTranscript.tsx`
- Modify: `src/client/components/messages/TextMessage.tsx`
- Modify: `src/client/components/chat-ui/RightSidebar.tsx`
- Modify: `src/client/components/chat-ui/TerminalWorkspace.tsx`
- Modify: `src/client/app/SettingsPage.tsx`
- Modify: `src/client/components/chat-ui/sidebar/ChatRow.tsx`
- Modify: `src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx`
- Test: `src/client/app/ChatPage.test.ts`
- Test: `src/client/components/chat-ui/RightSidebar.test.ts`
- Test: `src/client/app/SettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add render-level assertions for broad visible context ids:

```ts
describe("broad visible overlay coverage", () => {
  test("tags transcript and message content roots with context-first ids", () => {
    const html = renderToStaticMarkup(/* existing chat page fixture */)
    expect(html).toContain("transcript.message-list.area")
    expect(html).toContain("message.assistant.response.area")
  })
})
```

Add sibling assertions for:
- `chat.right-sidebar.area`
- `chat.terminal-workspace.area`
- `settings.page.area`
- `sidebar.chat-row.item`
- `sidebar.project-group.area`

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts src/client/app/SettingsPage.test.tsx`
Expected: FAIL because some surfaces still use older untyped ids or remain untagged.

- [ ] **Step 3: Write minimal implementation**

Normalize broad visible roots to the new descriptor helper and C3 mapping:

```tsx
const MESSAGE_RESPONSE_ID = createUiIdentityDescriptor({
  id: "message.assistant.response.area",
  c3ComponentId: "c3-111",
})
```

Use the same pattern for:
- `transcript.message-list.area` → `c3-110`
- `chat.right-sidebar.area` → `c3-115`
- `chat.terminal-workspace.area` → `c3-114`
- `settings.page.area` → `c3-116`
- `sidebar.chat-row.item` / `sidebar.project-group.area` → `c3-113`

Preserve existing action/menu tags where they already exist; this task is about making broad visible roots consistently grab-worthy.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts src/client/app/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app/ChatPage.tsx src/client/app/TinkariaTranscript.tsx src/client/components/messages/TextMessage.tsx src/client/components/chat-ui/RightSidebar.tsx src/client/components/chat-ui/TerminalWorkspace.tsx src/client/app/SettingsPage.tsx src/client/components/chat-ui/sidebar/ChatRow.tsx src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts src/client/app/SettingsPage.test.tsx
git commit -m "feat: expand broad overlay surface coverage"
```

### Task 5: Verify End-To-End Overlay Behavior On Real UI

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run targeted automated verification**

Run:

```bash
bun test src/client/lib/uiIdentityOverlay.test.ts src/client/app/App.test.tsx src/client/components/ui/UiIdentityOverlay.test.tsx src/client/components/rich-content/RichContentBlock.test.tsx src/client/components/rich-content/ContentOverlay.test.tsx src/client/components/messages/LocalFilePreviewDialog.test.tsx src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts src/client/app/SettingsPage.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run build and type verification**

Run:

```bash
bun run build
bunx @typescript/native-preview --noEmit -p tsconfig.json
```

Expected:
- `bun run build` PASS
- native TypeScript check still fails only on the pre-existing `tsconfig.json` `baseUrl` removal error unless separately fixed in this branch

- [ ] **Step 3: Run C3 verification**

Run:

```bash
bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected: PASS, or only previously known non-blocking warnings remain.

- [ ] **Step 4: Run browser smoke verification**

Use the local dev server and `agent-browser` to confirm:
- holding `Alt` + `Shift` over transcript content shows broad root ids first
- rich-content viewer and content-review surfaces are grab-worthy
- copied text uses the `ui-id | c3:<id>` contract where metadata exists
- visible overlay rows do not show the C3 suffix inline

Suggested commands:

```bash
bun run dev:client
agent-browser open http://localhost:5173
agent-browser snapshot -i -c
agent-browser screenshot
```

Record the concrete surfaces exercised and any gaps found.

- [ ] **Step 5: Update handoff doc and commit**

Update `tasks/todo.md` with:
- implemented broad visible-surface coverage
- rich-content/review root coverage
- C3-aware copied payload behavior
- verification evidence and any residual gaps

Then commit:

```bash
git add tasks/todo.md
git commit -m "docs: record overlay context expansion verification"
```
