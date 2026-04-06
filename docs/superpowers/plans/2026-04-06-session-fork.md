# Session Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create a new, independent chat session from the navbar, seeded with user-written context and targeting a specific provider/model.

**Architecture:** Replace the unused "Compose" (SquarePen) navbar button with a "Fork session" action that opens a dialog. The dialog contains a textarea + provider/model pickers. On confirm, it calls existing `chat.create` + `chat.send` NATS commands and navigates to the new chat. Zero server changes.

**Tech Stack:** React 19, Radix Dialog, Tailwind CSS 4, Zustand (chatPreferencesStore), lucide-react (GitFork icon)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/client/components/chat-ui/ForkSessionDialog.tsx` | Create | Self-contained dialog: textarea + provider/model picker + confirm/cancel |
| `src/client/components/chat-ui/ForkSessionDialog.test.tsx` | Create | Unit tests for dialog rendering and state logic |
| `src/client/components/chat-ui/ChatNavbar.tsx` | Modify | Replace `onNewChat` prop with `onForkSession`, swap icon |
| `src/client/components/chat-ui/ChatNavbar.test.tsx` | Modify | Update tests for renamed prop and new icon |
| `src/client/app/ChatPage.tsx` | Modify | Add fork dialog state + render `ForkSessionDialog`, wire handler |
| `src/client/app/ChatPage.test.ts` | Modify | Update ChatNavbar prop in tests |
| `src/client/app/useTinkariaState.ts` | Modify | Add `handleForkSession` to TinkariaState |

---

### Task 1: ChatNavbar — Replace `onNewChat` with `onForkSession`

**Files:**
- Modify: `src/client/components/chat-ui/ChatNavbar.tsx:1-187`
- Modify: `src/client/components/chat-ui/ChatNavbar.test.tsx:1-81`
- Modify: `src/client/app/ChatPage.test.ts:244-279`

- [ ] **Step 1: Write the failing test — ChatNavbar renders Fork icon**

In `src/client/components/chat-ui/ChatNavbar.test.tsx`, replace the test at line 21 that checks for `title="Compose"`:

```tsx
test("renders a fork-session button instead of compose", () => {
  const html = renderToStaticMarkup(
    <ChatNavbar
      sidebarCollapsed={false}
      onOpenSidebar={() => {}}
      onCollapseSidebar={() => {}}
      onExpandSidebar={() => {}}
      onForkSession={() => {}}
    />,
  )

  expect(html).toContain('title="Fork session"')
  expect(html).not.toContain('title="Compose"')
})
```

Also update the test at line 38 and line 6 — every `ChatNavbar` render must change `onNewChat` to `onForkSession`. The test at line 38 currently passes `onNewChat={() => {}}`. Change all occurrences.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/components/chat-ui/ChatNavbar.test.tsx`
Expected: FAIL — `onForkSession` is not a valid prop, `title="Fork session"` not found.

- [ ] **Step 3: Update ChatNavbar component**

In `src/client/components/chat-ui/ChatNavbar.tsx`:

1. Change the import on line 1:
```tsx
import { GitFork, Menu, PanelLeft } from "lucide-react"
```
(Remove `SquarePen`, add `GitFork`)

2. In the `Props` interface (line 10-20), replace `onNewChat`:
```tsx
onForkSession: () => void
```

3. In the destructured props (line 66-76), replace `onNewChat` with `onForkSession`.

4. Rename the UI identity on line 78:
```tsx
const forkSessionActionId = createUiIdentity("chat.navbar.fork-session", "action")
```

5. Replace the button at lines 139-147:
```tsx
<Button
  {...getUiIdentityAttributeProps(forkSessionActionId)}
  variant="ghost"
  size="icon"
  onClick={onForkSession}
  title="Fork session"
>
  <GitFork className="size-4.5" />
</Button>
```

- [ ] **Step 4: Update ChatPage.test.ts**

In `src/client/app/ChatPage.test.ts`, find all `ChatNavbar` renders (lines 246-260, 263-278) and change `onNewChat={() => {}}` to `onForkSession={() => {}}`. Also update the assertion on line 256:
```ts
const forkButtonIndex = html.indexOf('title="Fork session"')
expect(forkButtonIndex).toBeGreaterThan(-1)
```

And the test at line 263 — change `newChatActionId` to:
```ts
const forkSessionActionId = createUiIdentity("chat.navbar.fork-session", "action")
```
And the assertion to check for `forkSessionActionId` instead of `newChatActionId`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/client/components/chat-ui/ChatNavbar.test.tsx src/client/app/ChatPage.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/components/chat-ui/ChatNavbar.tsx src/client/components/chat-ui/ChatNavbar.test.tsx src/client/app/ChatPage.test.ts
git commit -m "refactor: replace navbar Compose button with Fork session action"
```

---

### Task 2: ForkSessionDialog — Build the dialog component

**Files:**
- Create: `src/client/components/chat-ui/ForkSessionDialog.tsx`
- Create: `src/client/components/chat-ui/ForkSessionDialog.test.tsx`

- [ ] **Step 1: Write the failing test — dialog renders with expected structure**

Create `src/client/components/chat-ui/ForkSessionDialog.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ForkSessionDialog } from "./ForkSessionDialog"
import { PROVIDERS } from "../../../shared/types"

describe("ForkSessionDialog", () => {
  test("renders dialog content when open", () => {
    const html = renderToStaticMarkup(
      <ForkSessionDialog
        open
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        onFork={async () => {}}
      />,
    )

    expect(html).toContain("Fork session")
    expect(html).toContain("Start the new session with...")
    expect(html).toContain("Create Session")
  })

  test("does not render dialog content when closed", () => {
    const html = renderToStaticMarkup(
      <ForkSessionDialog
        open={false}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        onFork={async () => {}}
      />,
    )

    expect(html).not.toContain("Fork session")
    expect(html).not.toContain("Create Session")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/components/chat-ui/ForkSessionDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ForkSessionDialog**

Create `src/client/components/chat-ui/ForkSessionDialog.tsx`:

```tsx
import { useCallback, useRef, useState } from "react"
import { Box } from "lucide-react"
import type { AgentProvider, ProviderCatalogEntry } from "../../../shared/types"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogGhostButton,
  DialogHeader,
  DialogPrimaryButton,
  DialogTitle,
} from "../ui/dialog"
import { Textarea } from "../ui/textarea"
import { InputPopover, PopoverMenuItem, PROVIDER_ICONS } from "./ChatPreferenceControls"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProvider: AgentProvider
  defaultModel: string
  availableProviders: ProviderCatalogEntry[]
  onFork: (context: string, provider: AgentProvider, model: string) => Promise<void>
}

export function ForkSessionDialog({
  open,
  onOpenChange,
  defaultProvider,
  defaultModel,
  availableProviders,
  onFork,
}: Props) {
  const [openVersion, setOpenVersion] = useState(0)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      setOpenVersion((current) => current + 1)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        {open ? (
          <ForkSessionDialogBody
            key={openVersion}
            defaultProvider={defaultProvider}
            defaultModel={defaultModel}
            availableProviders={availableProviders}
            onFork={onFork}
            onClose={() => handleOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ForkSessionDialogBody({
  defaultProvider,
  defaultModel,
  availableProviders,
  onFork,
  onClose,
}: {
  defaultProvider: AgentProvider
  defaultModel: string
  availableProviders: ProviderCatalogEntry[]
  onFork: (context: string, provider: AgentProvider, model: string) => Promise<void>
  onClose: () => void
}) {
  const [context, setContext] = useState("")
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider)
  const [model, setModel] = useState(defaultModel)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const providerConfig = availableProviders.find((p) => p.id === provider) ?? availableProviders[0]
  const ProviderIcon = PROVIDER_ICONS[provider]

  const handleProviderChange = useCallback(
    (nextProvider: AgentProvider) => {
      setProvider(nextProvider)
      const nextConfig = availableProviders.find((p) => p.id === nextProvider)
      if (nextConfig) {
        setModel(nextConfig.models[0]?.id ?? defaultModel)
      }
    },
    [availableProviders, defaultModel],
  )

  async function handleConfirm() {
    if (!context.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      await onFork(context.trim(), provider, model)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fork session</DialogTitle>
      </DialogHeader>
      <div className="px-4 pb-4 pt-3.5 space-y-3">
        <Textarea
          ref={textareaRef}
          placeholder="Start the new session with..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
          autoFocus
          rows={4}
          className="resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && context.trim() && !pending) {
              e.preventDefault()
              void handleConfirm()
            }
          }}
        />
        <div className="flex items-center gap-1">
          <InputPopover
            trigger={
              <>
                <ProviderIcon className="h-3.5 w-3.5" />
                <span>{providerConfig?.label ?? provider}</span>
              </>
            }
          >
            {(close) =>
              availableProviders.map((p) => {
                const Icon = PROVIDER_ICONS[p.id]
                return (
                  <PopoverMenuItem
                    key={p.id}
                    onClick={() => {
                      handleProviderChange(p.id)
                      close()
                    }}
                    selected={provider === p.id}
                    icon={<Icon className="h-4 w-4 text-muted-foreground" />}
                    label={p.label}
                  />
                )
              })
            }
          </InputPopover>
          <InputPopover
            trigger={
              <>
                <Box className="h-3.5 w-3.5" />
                <span>{providerConfig?.models.find((m) => m.id === model)?.label ?? model}</span>
              </>
            }
          >
            {(close) =>
              (providerConfig?.models ?? []).map((m) => (
                <PopoverMenuItem
                  key={m.id}
                  onClick={() => {
                    setModel(m.id)
                    close()
                  }}
                  selected={model === m.id}
                  icon={<Box className="h-4 w-4 text-muted-foreground" />}
                  label={m.label}
                />
              ))
            }
          </InputPopover>
        </div>
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : null}
      </div>
      <DialogFooter>
        <DialogGhostButton onClick={onClose} disabled={pending}>
          Cancel
        </DialogGhostButton>
        <DialogPrimaryButton
          onClick={() => void handleConfirm()}
          disabled={!context.trim() || pending}
        >
          {pending ? "Creating..." : "Create Session"}
        </DialogPrimaryButton>
      </DialogFooter>
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/chat-ui/ForkSessionDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/chat-ui/ForkSessionDialog.tsx src/client/components/chat-ui/ForkSessionDialog.test.tsx
git commit -m "feat: add ForkSessionDialog component"
```

---

### Task 3: useTinkariaState — Add `handleForkSession`

**Files:**
- Modify: `src/client/app/useTinkariaState.ts:543-623` (TinkariaState interface)
- Modify: `src/client/app/useTinkariaState.ts:1742-1754` (handleCompose area)
- Modify: `src/client/app/useTinkariaState.ts:1830-1869` (return block)

- [ ] **Step 1: Add `handleForkSession` to the TinkariaState interface**

In `src/client/app/useTinkariaState.ts`, add after line 611 (`handleCompose: () => void`):

```ts
handleForkSession: (context: string, provider: AgentProvider, model: string) => Promise<void>
```

- [ ] **Step 2: Implement `handleForkSession` function**

After the `handleCompose` function (around line 1754), add:

```ts
async function handleForkSession(context: string, provider: AgentProvider, model: string) {
  const projectId = selectedProjectId ?? sidebarData.projectGroups[0]?.groupKey ?? null
  if (!projectId) {
    throw new Error("Open a project first")
  }

  const result = await socket.command<{ chatId: string }>({ type: "chat.create", projectId })

  const providerDefaults = useChatPreferencesStore.getState().providerDefaults
  const defaults = providerDefaults[provider]
  const modelOptions: ModelOptions = provider === "claude"
    ? { claude: { ...defaults.modelOptions as import("../../shared/types").ClaudeModelOptions } }
    : { codex: { ...defaults.modelOptions as import("../../shared/types").CodexModelOptions } }

  await socket.command({
    type: "chat.send",
    chatId: result.chatId,
    provider,
    content: context,
    model,
    modelOptions,
  })

  setPendingChatId(result.chatId)
  navigate(`/chat/${result.chatId}`)
  setSidebarOpen(false)
  setCommandError(null)
}
```

- [ ] **Step 3: Add `handleForkSession` to the return block**

In the return object (around line 1865), add after `handleCompose,`:

```ts
handleForkSession,
```

- [ ] **Step 4: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors related to `handleForkSession` or `TinkariaState`.

- [ ] **Step 5: Commit**

```bash
git add src/client/app/useTinkariaState.ts
git commit -m "feat: add handleForkSession to TinkariaState"
```

---

### Task 4: ChatPage — Wire fork dialog to navbar + state

**Files:**
- Modify: `src/client/app/ChatPage.tsx:1-523`

- [ ] **Step 1: Add fork dialog state and imports**

At the top of `ChatPage.tsx`, add the import (after the existing chat-ui imports around line 6):

```tsx
import { ForkSessionDialog } from "../components/chat-ui/ForkSessionDialog"
```

Also add `useState` to the React import on line 1 (it's already there via `useEffect, useMemo, useRef`):

```tsx
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
```

- [ ] **Step 2: Add dialog state and handler in ChatPage component**

Inside `ChatPage()`, after line 193 (`const showRightSidebar = ...`), add:

```tsx
const [forkDialogOpen, setForkDialogOpen] = useState(false)
```

- [ ] **Step 3: Replace the ChatNavbar `onNewChat` prop**

On line 312, change:

```tsx
onNewChat={state.handleCompose}
```

to:

```tsx
onForkSession={() => setForkDialogOpen(true)}
```

- [ ] **Step 4: Render ForkSessionDialog**

After the `<ChatNavbar ... />` block (after line 317), add:

```tsx
<ForkSessionDialog
  open={forkDialogOpen}
  onOpenChange={setForkDialogOpen}
  defaultProvider={state.runtime?.provider ?? "claude"}
  defaultModel={state.availableProviders.find(
    (p) => p.id === (state.runtime?.provider ?? "claude")
  )?.models[0]?.id ?? "sonnet"}
  availableProviders={state.availableProviders}
  onFork={state.handleForkSession}
/>
```

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 6: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/client/app/ChatPage.tsx
git commit -m "feat: wire fork session dialog into ChatPage"
```

---

### Task 5: Smoke Test — Verify end-to-end in browser

**Files:** None (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`

- [ ] **Step 2: Open Tinkaria in browser and verify**

1. Navigate to an existing chat session
2. Verify the navbar shows a GitFork icon (not SquarePen) in the left pill
3. Click the Fork icon — dialog should open with "Fork session" title
4. Verify textarea autofocuses with placeholder "Start the new session with..."
5. Verify provider/model pickers show correct options
6. Type some context, click "Create Session"
7. Verify: new chat opens, context appears as first message, turn starts

- [ ] **Step 3: Test edge cases**

1. Open dialog, close without submitting — no chat created
2. Open dialog with empty textarea — "Create Session" button is disabled
3. Change provider in picker — model list updates to match
4. Cmd+Enter in textarea — submits the form

- [ ] **Step 4: Commit any fixes discovered during smoke test**

Only if needed.
