# UI Identity Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hold-to-reveal Alt+Shift overlay that exposes curated, copyable `ui-id` labels for meaningful Kanna UI surfaces and their tagged ancestors.

**Architecture:** Add a small app-shell overlay controller that tracks modifier keys and pointer position, resolves the nearest tagged surface plus tagged ancestors, and renders a floating stack through a portal. Keep feature-level changes minimal by introducing an explicit tagging primitive that high-value chat, sidebar, terminal, and settings surfaces opt into declaratively.

**Tech Stack:** React 19, TypeScript, Bun test, React DOM portal APIs, existing Tailwind utility styling, C3 architecture metadata

---

### Task 1: Add Pure Overlay Resolution Helpers

**Files:**
- Create: `src/client/lib/uiIdentityOverlay.ts`
- Test: `src/client/lib/uiIdentityOverlay.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import {
  buildUiIdentityStack,
  getUiIdentityAttributeProps,
  isUiIdentityOverlayActive,
} from "./uiIdentityOverlay"

function createTaggedElement(id: string, parent: HTMLElement | null = null) {
  const element = document.createElement("div")
  element.dataset.uiId = id
  if (parent) parent.appendChild(element)
  return element
}

describe("isUiIdentityOverlayActive", () => {
  test("activates only when Alt and Shift are both pressed", () => {
    expect(isUiIdentityOverlayActive({ altKey: true, shiftKey: true })).toBe(true)
    expect(isUiIdentityOverlayActive({ altKey: true, shiftKey: false })).toBe(false)
    expect(isUiIdentityOverlayActive({ altKey: false, shiftKey: true })).toBe(false)
  })
})

describe("buildUiIdentityStack", () => {
  test("returns the nearest tagged element followed by tagged ancestors up to the cap", () => {
    const root = createTaggedElement("chat.page")
    const transcript = createTaggedElement("transcript.message-list", root)
    const message = createTaggedElement("message.assistant.response", transcript)
    const leaf = document.createElement("span")
    message.appendChild(leaf)

    expect(buildUiIdentityStack(leaf, 3).map((entry) => entry.id)).toEqual([
      "message.assistant.response",
      "transcript.message-list",
      "chat.page",
    ])
  })

  test("returns an empty stack when no tagged ancestor exists", () => {
    const leaf = document.createElement("span")
    expect(buildUiIdentityStack(leaf, 3)).toEqual([])
  })
})

describe("getUiIdentityAttributeProps", () => {
  test("returns the data attributes used by tagged surfaces", () => {
    expect(getUiIdentityAttributeProps("chat.page")).toEqual({
      "data-ui-id": "chat.page",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/lib/uiIdentityOverlay.test.ts`
Expected: FAIL because `src/client/lib/uiIdentityOverlay.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export const UI_IDENTITY_ATTRIBUTE = "data-ui-id"
const DEFAULT_UI_IDENTITY_STACK_LIMIT = 3

export interface UiIdentityModifierState {
  altKey: boolean
  shiftKey: boolean
}

export interface UiIdentityStackEntry {
  id: string
  element: HTMLElement
}

export function isUiIdentityOverlayActive(modifiers: UiIdentityModifierState): boolean {
  return modifiers.altKey && modifiers.shiftKey
}

export function getUiIdentityAttributeProps(id: string): Record<typeof UI_IDENTITY_ATTRIBUTE, string> {
  return {
    [UI_IDENTITY_ATTRIBUTE]: id,
  }
}

export function buildUiIdentityStack(target: EventTarget | null, limit = DEFAULT_UI_IDENTITY_STACK_LIMIT): UiIdentityStackEntry[] {
  if (!(target instanceof Element)) return []

  const result: UiIdentityStackEntry[] = []
  let current: Element | null = target
  while (current && result.length < limit) {
    const id = current.getAttribute(UI_IDENTITY_ATTRIBUTE)
    if (id && current instanceof HTMLElement) {
      result.push({ id, element: current })
    }
    current = current.parentElement
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/lib/uiIdentityOverlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/uiIdentityOverlay.ts src/client/lib/uiIdentityOverlay.test.ts
git commit -m "feat: add ui identity overlay helpers"
```

### Task 2: Add the Global Overlay Controller and View

**Files:**
- Create: `src/client/components/ui/UiIdentityOverlay.tsx`
- Create: `src/client/components/ui/UiIdentityOverlay.test.tsx`
- Modify: `src/client/app/App.tsx`
- Modify: `src/client/app/App.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { UiIdentityOverlay, getOverlayCopyLabel } from "./UiIdentityOverlay"

describe("UiIdentityOverlay", () => {
  test("renders rows for the active identity stack", () => {
    const markup = renderToStaticMarkup(
      <UiIdentityOverlay
        active
        anchorRect={{ top: 20, left: 30, width: 100, height: 40, right: 130, bottom: 60 }}
        stack={[
          { id: "message.assistant.response", element: null as never },
          { id: "transcript.message-list", element: null as never },
        ]}
        highlightedId="message.assistant.response"
        copiedId={null}
        onCopy={() => {}}
        onHighlight={() => {}}
      />
    )

    expect(markup).toContain("message.assistant.response")
    expect(markup).toContain("transcript.message-list")
  })
})

describe("getOverlayCopyLabel", () => {
  test("prefers copied feedback for the copied row", () => {
    expect(getOverlayCopyLabel("chat.page", "chat.page")).toBe("Copied")
    expect(getOverlayCopyLabel("chat.page", null)).toBe("Copy")
  })
})
```

```ts
import { describe, expect, test } from "bun:test"
import { shouldRedirectToChangelog } from "./App"

describe("shouldRedirectToChangelog", () => {
  test("redirects only from the root route when the version is unseen", () => {
    expect(shouldRedirectToChangelog("/", "0.12.0", null)).toBe(true)
  })
})
```

Update the app test file by adding this new pure helper test:

```ts
import { describe, expect, test } from "bun:test"
import { getUiIdentityOverlayCopyDurationMs } from "./App"

describe("getUiIdentityOverlayCopyDurationMs", () => {
  test("uses a short-lived copied confirmation window", () => {
    expect(getUiIdentityOverlayCopyDurationMs()).toBe(1200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx`
Expected: FAIL because `UiIdentityOverlay` and `getUiIdentityOverlayCopyDurationMs()` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/client/components/ui/UiIdentityOverlay.tsx` with a focused presentational component:

```tsx
import { createPortal } from "react-dom"
import { cn } from "../../lib/utils"
import type { UiIdentityStackEntry } from "../../lib/uiIdentityOverlay"

interface UiIdentityOverlayProps {
  active: boolean
  anchorRect: Pick<DOMRect, "top" | "left" | "right" | "bottom" | "width" | "height"> | null
  stack: UiIdentityStackEntry[]
  highlightedId: string | null
  copiedId: string | null
  onCopy: (id: string) => void
  onHighlight: (id: string) => void
}

export function getOverlayCopyLabel(id: string, copiedId: string | null): string {
  return copiedId === id ? "Copied" : "Copy"
}

export function UiIdentityOverlay(props: UiIdentityOverlayProps) {
  if (!props.active || !props.anchorRect || props.stack.length === 0) {
    return null
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[120] select-none"
      style={{ top: props.anchorRect.top + 8, left: props.anchorRect.left + 8 }}
    >
      <div className="flex min-w-56 flex-col gap-1 rounded-xl border border-border bg-background/95 p-2 shadow-xl backdrop-blur-sm">
        {props.stack.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={cn(
              "pointer-events-auto flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs",
              props.highlightedId === entry.id ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            onMouseEnter={() => props.onHighlight(entry.id)}
            onFocus={() => props.onHighlight(entry.id)}
            onClick={() => props.onCopy(entry.id)}
          >
            <span className="font-medium">{entry.id}</span>
            <span className="text-[11px]">{getOverlayCopyLabel(entry.id, props.copiedId)}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
```

Update `src/client/app/App.tsx` by:
- exporting `getUiIdentityOverlayCopyDurationMs()`
- mounting a `UiIdentityOverlayController` inside `TooltipProvider`
- using a true external-boundary effect only for window key/pointer listeners

Minimal controller shape to add in `App.tsx`:

```tsx
const UI_IDENTITY_OVERLAY_COPY_DURATION_MS = 1200

export function getUiIdentityOverlayCopyDurationMs() {
  return UI_IDENTITY_OVERLAY_COPY_DURATION_MS
}

function UiIdentityOverlayController() {
  const [modifiers, setModifiers] = useState({ altKey: false, shiftKey: false })
  const [pointerTarget, setPointerTarget] = useState<EventTarget | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const stack = useMemo(() => buildUiIdentityStack(pointerTarget, 3), [pointerTarget])
  const active = isUiIdentityOverlayActive(modifiers)
  const anchorRect = stack[0]?.element.getBoundingClientRect() ?? null

  useEffect(() => {
    function handleKeyChange(event: KeyboardEvent) {
      setModifiers({ altKey: event.altKey, shiftKey: event.shiftKey })
    }
    function handlePointerMove(event: PointerEvent) {
      setPointerTarget(event.target)
    }
    window.addEventListener("keydown", handleKeyChange)
    window.addEventListener("keyup", handleKeyChange)
    window.addEventListener("pointermove", handlePointerMove)
    return () => {
      window.removeEventListener("keydown", handleKeyChange)
      window.removeEventListener("keyup", handleKeyChange)
      window.removeEventListener("pointermove", handlePointerMove)
    }
  }, [])

  return (
    <UiIdentityOverlay
      active={active}
      anchorRect={anchorRect}
      stack={active ? stack : []}
      highlightedId={stack[0]?.id ?? null}
      copiedId={copiedId}
      onHighlight={() => {}}
      onCopy={(id) => {
        void navigator.clipboard.writeText(id)
        setCopiedId(id)
        window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), UI_IDENTITY_OVERLAY_COPY_DURATION_MS)
      }}
    />
  )
}
```

Render it in `App()`:

```tsx
<TooltipProvider>
  <UiIdentityOverlayController />
  <AppDialogProvider>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ui/UiIdentityOverlay.tsx src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.tsx src/client/app/App.test.tsx
git commit -m "feat: add global ui identity overlay"
```

### Task 3: Tag First-Release Chat Surfaces

**Files:**
- Modify: `src/client/app/ChatPage.tsx`
- Modify: `src/client/app/KannaTranscript.tsx`
- Modify: `src/client/components/messages/UserMessage.tsx`
- Modify: `src/client/components/messages/TextMessage.tsx`
- Modify: `src/client/components/chat-ui/ChatInput.tsx`
- Modify: `src/client/components/chat-ui/ChatNavbar.tsx`
- Test: `src/client/app/ChatPage.test.ts`

- [ ] **Step 1: Write the failing tests**

Add focused expectations in `src/client/app/ChatPage.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"

describe("getUiIdentityAttributeProps", () => {
  test("uses the shared ui-id attribute name for tagged chat surfaces", () => {
    expect(getUiIdentityAttributeProps("chat.page")).toEqual({
      "data-ui-id": "chat.page",
    })
  })
})
```

Add one pure helper in `ChatPage.tsx` and test it:

```ts
export function getChatPageUiIdentities() {
  return {
    page: "chat.page",
    transcript: "transcript.message-list",
    composer: "chat.composer",
    navbar: "chat.navbar",
  }
}

describe("getChatPageUiIdentities", () => {
  test("returns the curated first-release chat ids", () => {
    expect(getChatPageUiIdentities()).toEqual({
      page: "chat.page",
      transcript: "transcript.message-list",
      composer: "chat.composer",
      navbar: "chat.navbar",
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/app/ChatPage.test.ts`
Expected: FAIL because `getChatPageUiIdentities()` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Apply `getUiIdentityAttributeProps()` to the first-release chat surfaces:

```tsx
import { getUiIdentityAttributeProps } from "../lib/uiIdentityOverlay"

export function getChatPageUiIdentities() {
  return {
    page: "chat.page",
    transcript: "transcript.message-list",
    composer: "chat.composer",
    navbar: "chat.navbar",
  }
}

const chatUiIds = getChatPageUiIdentities()

<div
  ref={layoutRootRef}
  {...getUiIdentityAttributeProps(chatUiIds.page)}
  className="flex h-full min-h-0 flex-col"
>
```

```tsx
<div {...getUiIdentityAttributeProps("transcript.message-list")}>
  <KannaTranscript ... />
</div>
```

```tsx
<div {...getUiIdentityAttributeProps("chat.navbar")}>
  <ChatNavbar ... />
</div>
```

```tsx
<div {...getUiIdentityAttributeProps("chat.composer")}>
  <ChatInput ... />
</div>
```

Inside transcript/message components, tag the meaningful message surfaces rather than every nested element:

```tsx
<div className="flex flex-col items-end gap-1.5" {...getUiIdentityAttributeProps("message.user.prompt")}>
```

```tsx
<RichContentBlock
  {...getUiIdentityAttributeProps("message.assistant.response")}
  type="markdown"
```

If `RichContentBlock` cannot accept pass-through DOM props cleanly, tag the stable wrapper in `TextMessage` instead:

```tsx
<div {...getUiIdentityAttributeProps("message.assistant.response")}>
  {content}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/app/ChatPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app/ChatPage.tsx src/client/app/KannaTranscript.tsx src/client/components/messages/UserMessage.tsx src/client/components/messages/TextMessage.tsx src/client/components/chat-ui/ChatInput.tsx src/client/components/chat-ui/ChatNavbar.tsx src/client/app/ChatPage.test.ts
git commit -m "feat: tag chat surfaces for ui identity overlay"
```

### Task 4: Tag Sidebar, Terminal, and Settings Surfaces and Finish Verification

**Files:**
- Modify: `src/client/app/KannaSidebar.tsx`
- Modify: `src/client/components/chat-ui/RightSidebar.tsx`
- Modify: `src/client/components/chat-ui/TerminalWorkspace.tsx`
- Modify: `src/client/app/SettingsPage.tsx`
- Test: `src/client/components/chat-ui/RightSidebar.test.ts`
- Test: `src/client/app/App.test.tsx`
- Docs: `tasks/todo.md`

- [ ] **Step 1: Write the failing tests**

Extend `src/client/components/chat-ui/RightSidebar.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebar } from "./RightSidebar"

describe("RightSidebar", () => {
  test("renders the curated ui-id tag for the sidebar shell", () => {
    const markup = renderToStaticMarkup(RightSidebar({ onClose: () => {} }))
    expect(markup).toContain("data-ui-id=\"chat.right-sidebar\"")
  })
})
```

Add a pure helper test in `App.test.tsx` for first-release non-chat ids:

```ts
import { describe, expect, test } from "bun:test"
import { getGlobalUiIdentityIds } from "./App"

describe("getGlobalUiIdentityIds", () => {
  test("returns curated ids for first-release non-chat shells", () => {
    expect(getGlobalUiIdentityIds()).toEqual({
      sidebar: "chat.sidebar",
      terminal: "chat.terminal-workspace",
      rightSidebar: "chat.right-sidebar",
      settings: "settings.page",
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/components/chat-ui/RightSidebar.test.ts src/client/app/App.test.tsx`
Expected: FAIL because the components are not tagged yet and `getGlobalUiIdentityIds()` does not exist.

- [ ] **Step 3: Write minimal implementation**

Export the shared first-release ids in `App.tsx`:

```ts
export function getGlobalUiIdentityIds() {
  return {
    sidebar: "chat.sidebar",
    terminal: "chat.terminal-workspace",
    rightSidebar: "chat.right-sidebar",
    settings: "settings.page",
  }
}
```

Tag the relevant shells:

```tsx
<div
  data-sidebar="open"
  {...getUiIdentityAttributeProps("chat.sidebar")}
  className={cn(...)}
>
```

```tsx
<div {...getUiIdentityAttributeProps("chat.right-sidebar")} className="h-full min-h-0 border-l border-border bg-background md:min-w-[300px]">
```

```tsx
<div {...getUiIdentityAttributeProps("chat.terminal-workspace")}>
  <TerminalWorkspace ... />
</div>
```

```tsx
<div {...getUiIdentityAttributeProps("settings.page")} className="flex h-full min-h-0">
```

Update `tasks/todo.md` after verification so the handoff records:
- implementation complete
- exact tests/build/typecheck/c3 commands run
- browser smoke-test result

- [ ] **Step 4: Run tests and verification to verify it passes**

Run:

```bash
bun test src/client/lib/uiIdentityOverlay.test.ts src/client/components/ui/UiIdentityOverlay.test.tsx src/client/app/App.test.tsx src/client/app/ChatPage.test.ts src/client/components/chat-ui/RightSidebar.test.ts
bun run build
bunx @typescript/native-preview --noEmit -p tsconfig.json
bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected:
- all targeted tests PASS
- build PASS
- typecheck PASS, unless an unrelated pre-existing repo issue blocks it and is documented
- `c3x check` PASS

Then run a browser smoke test with `agent-browser` against the local app:

```bash
agent-browser open http://localhost:5174
agent-browser snapshot -i -c
```

In the smoke test, verify:
- holding `Alt` + `Shift` over a tagged chat surface reveals the overlay
- the stack shows the nearest tagged surface first
- clicking a row copies the expected id
- moving across tagged parent areas updates the highlighted target

- [ ] **Step 5: Commit**

```bash
git add src/client/app/KannaSidebar.tsx src/client/components/chat-ui/RightSidebar.tsx src/client/components/chat-ui/TerminalWorkspace.tsx src/client/app/SettingsPage.tsx src/client/components/chat-ui/RightSidebar.test.ts src/client/app/App.test.tsx tasks/todo.md
git commit -m "feat: tag shell surfaces for ui identity overlay"
```

## Self-Review

Spec coverage:
- Activation and teardown are covered in Task 1 helper logic and Task 2 controller wiring.
- The portal overlay, copy flow, and compact stack rendering are covered in Task 2.
- Curated first-release tagging across chat, sidebar, terminal, and settings surfaces is covered in Tasks 3 and 4.
- Verification requirements from the spec are covered in Task 4.

Placeholder scan:
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task contains concrete files, code, commands, and expected outcomes.

Type consistency:
- Shared naming stays on `ui-id` / `data-ui-id`, `UiIdentityOverlay`, `buildUiIdentityStack()`, `getUiIdentityAttributeProps()`, and `getGlobalUiIdentityIds()`.
- The overlay stack entries consistently use `{ id, element }`.
