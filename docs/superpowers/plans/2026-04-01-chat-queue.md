# Chat Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users stage follow-up prompts while a turn is still running, show that staged content as one multi-paragraph queue block above the composer, and auto-send it when the runtime becomes idle.

**Architecture:** Keep queueing entirely client-side inside the existing `c3-110` chat state boundary, with `ChatInput` handling only presentation and keyboard ergonomics. Busy submits append into one typed queued-text buffer, and an idle-transition flush reuses the existing `chat.send` socket command path so provider/model options remain unchanged.

**Tech Stack:** React 19, TypeScript, Zustand stores already in repo, Bun test, existing C3 CLI (`c3x`)

---

### Task 1: Add the RED tests for queue state logic in `useKannaState`

**Files:**
- Modify: `src/client/app/useKannaState.test.ts`
- Modify: `src/client/app/useKannaState.ts`
- Reference: `src/client/app/useKannaState.ts`

- [ ] **Step 1: Run C3 lookup for the state files before editing**

```bash
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/app/useKannaState.ts
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/app/useKannaState.test.ts
```

Expected: `src/client/app/useKannaState.ts` resolves to `c3-110` with `ref-ref-websocket-protocol`, `ref-ref-zustand-stores`, `rule-bun-test-conventions`, `rule-prefixed-logging`, and `rule-rule-strict-typescript`.

- [ ] **Step 2: Add failing tests for queue helper behavior**

Add these tests to [`useKannaState.test.ts`](/home/lagz0ne/dev/kanna/src/client/app/useKannaState.test.ts):

```typescript
describe("appendQueuedText", () => {
  test("uses the incoming text when the queue is empty", async () => {
    const module = await import("./useKannaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("", "Check layout")).toBe("Check layout")
  })

  test("appends a blank line between queued paragraphs", async () => {
    const module = await import("./useKannaState")
    const append = (module as Record<string, unknown>).appendQueuedText

    expect(typeof append).toBe("function")
    if (typeof append !== "function") throw new Error("appendQueuedText export missing")

    expect(append("Check layout", "Verify sidebar")).toBe("Check layout\n\nVerify sidebar")
  })
})

describe("shouldQueueChatSubmit", () => {
  test("returns false when runtime is idle and no queue exists", async () => {
    const module = await import("./useKannaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(false, "")).toBe(false)
  })

  test("returns true when the runtime is busy", async () => {
    const module = await import("./useKannaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(true, "")).toBe(true)
  })
})
```

- [ ] **Step 3: Run the targeted test and verify it fails**

Run:

```bash
bun test src/client/app/useKannaState.test.ts
```

Expected: FAIL with missing exports for `appendQueuedText` and `shouldQueueChatSubmit`.

- [ ] **Step 4: Add the minimal helpers to make the new tests pass**

Add these exports near the other pure helpers in [`useKannaState.ts`](/home/lagz0ne/dev/kanna/src/client/app/useKannaState.ts):

```typescript
export function appendQueuedText(currentQueuedText: string, nextContent: string): string {
  const trimmedCurrent = currentQueuedText.trim()
  const trimmedNext = nextContent.trim()
  if (!trimmedCurrent) return trimmedNext
  if (!trimmedNext) return trimmedCurrent
  return `${trimmedCurrent}\n\n${trimmedNext}`
}

export function shouldQueueChatSubmit(isProcessing: boolean, queuedText: string): boolean {
  return isProcessing || queuedText.trim().length > 0
}
```

- [ ] **Step 5: Re-run the targeted state test**

Run:

```bash
bun test src/client/app/useKannaState.test.ts
```

Expected: PASS for the new helper tests and existing `useKannaState` helper coverage.

- [ ] **Step 6: Commit the RED/GREEN helper slice**

```bash
git add src/client/app/useKannaState.ts src/client/app/useKannaState.test.ts
git commit -m "test: add chat queue state helpers"
```

### Task 2: Implement queue state and idle flush in `useKannaState`

**Files:**
- Modify: `src/client/app/useKannaState.ts`
- Modify: `src/client/app/useKannaState.test.ts`
- Reference: `src/client/app/ChatPage.tsx`

- [ ] **Step 1: Extend the state contract with queue fields and actions**

Update [`useKannaState.ts`](/home/lagz0ne/dev/kanna/src/client/app/useKannaState.ts) so `KannaState` includes:

```typescript
  queuedText: string
  handleSubmitFromComposer: (
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<void>
  clearQueuedText: () => void
  restoreQueuedText: () => string
```

Inside `useKannaState`, add the corresponding state:

```typescript
  const [queuedText, setQueuedText] = useState("")
  const queuedFlushInFlightRef = useRef(false)
  const queuedOptionsRef = useRef<{
    provider?: AgentProvider
    model?: string
    modelOptions?: ModelOptions
    planMode?: boolean
  } | null>(null)
```

- [ ] **Step 2: Add the queue-aware wrapper instead of changing raw transport send**

Keep `handleSend()` as the immediate socket command path. Add a wrapper like this:

```typescript
  async function handleSubmitFromComposer(
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) {
    if (shouldQueueChatSubmit(isProcessing, queuedText)) {
      setQueuedText((current) => appendQueuedText(current, content))
      queuedOptionsRef.current = options ?? null
      return
    }

    await handleSend(content, options)
  }
```

Use the last queued submit options for flush so queued sends preserve provider/model/modelOptions.

- [ ] **Step 3: Add idle-transition flush effect with duplicate-send guard**

Add an effect like this in [`useKannaState.ts`](/home/lagz0ne/dev/kanna/src/client/app/useKannaState.ts):

```typescript
  useEffect(() => {
    const text = queuedText.trim()
    if (!text || isProcessing || queuedFlushInFlightRef.current) return

    queuedFlushInFlightRef.current = true
    const options = queuedOptionsRef.current ?? undefined

    void handleSend(text, options)
      .then(() => {
        setQueuedText("")
        queuedOptionsRef.current = null
      })
      .catch(() => {
        // handleSend already stores commandError; keep queued text visible
      })
      .finally(() => {
        queuedFlushInFlightRef.current = false
      })
  }, [queuedText, isProcessing])
```

- [ ] **Step 4: Add restore/clear helpers**

Add these helpers to the same hook:

```typescript
  function clearQueuedText() {
    setQueuedText("")
    queuedOptionsRef.current = null
  }

  function restoreQueuedText(): string {
    const restored = queuedText
    setQueuedText("")
    queuedOptionsRef.current = null
    return restored
  }
```

Return them from the hook alongside `queuedText` and `handleSubmitFromComposer`.

- [ ] **Step 5: Add failing then passing tests for the queue-aware wrapper behavior**

Expand [`useKannaState.test.ts`](/home/lagz0ne/dev/kanna/src/client/app/useKannaState.test.ts) with pure helper-level assertions for:

```typescript
describe("shouldQueueChatSubmit", () => {
  test("returns true when queued text already exists even if runtime is idle", async () => {
    const module = await import("./useKannaState")
    const shouldQueue = (module as Record<string, unknown>).shouldQueueChatSubmit

    expect(typeof shouldQueue).toBe("function")
    if (typeof shouldQueue !== "function") throw new Error("shouldQueueChatSubmit export missing")

    expect(shouldQueue(false, "Existing queued text")).toBe(true)
  })
})
```

Then add one focused hook-level test if the existing harness supports rendering the hook; otherwise keep the queue branching pure and verify the effect path through the chat page test in Task 4.

- [ ] **Step 6: Run the targeted state test again**

Run:

```bash
bun test src/client/app/useKannaState.test.ts
```

Expected: PASS, including queued-state branching coverage.

- [ ] **Step 7: Commit the queue-state implementation slice**

```bash
git add src/client/app/useKannaState.ts src/client/app/useKannaState.test.ts
git commit -m "feat: add queued chat submit state"
```

### Task 3: Add RED/GREEN tests and UI support to `ChatInput`

**Files:**
- Modify: `src/client/components/chat-ui/ChatInput.tsx`
- Modify: `src/client/components/chat-ui/ChatInput.test.ts`

- [ ] **Step 1: Run C3 lookup for the input files before editing**

```bash
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/components/chat-ui/ChatInput.tsx
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/components/chat-ui/ChatInput.test.ts
```

Expected: `ChatInput.tsx` resolves to `c3-112` with `ref-ref-provider-abstraction`, `ref-ref-zustand-stores`, `rule-bun-test-conventions`, and `rule-rule-strict-typescript`.

- [ ] **Step 2: Add failing tests for queue rendering and restore-key behavior**

Add to [`ChatInput.test.ts`](/home/lagz0ne/dev/kanna/src/client/components/chat-ui/ChatInput.test.ts):

```typescript
import { describe, expect, test } from "bun:test"
import { getRestoredQueuedTextOnArrowUp, shouldShowQueuedBlock } from "./ChatInput"

describe("shouldShowQueuedBlock", () => {
  test("returns true when queued text exists", () => {
    expect(shouldShowQueuedBlock("Check layout")).toBe(true)
  })

  test("returns false when queued text is empty", () => {
    expect(shouldShowQueuedBlock("   ")).toBe(false)
  })
})

describe("getRestoredQueuedTextOnArrowUp", () => {
  test("restores the queue only when the textarea is empty", () => {
    expect(getRestoredQueuedTextOnArrowUp("", "Queued follow-up")).toBe("Queued follow-up")
    expect(getRestoredQueuedTextOnArrowUp("draft", "Queued follow-up")).toBeNull()
  })
})
```

- [ ] **Step 3: Run the targeted input test and verify it fails**

Run:

```bash
bun test src/client/components/chat-ui/ChatInput.test.ts
```

Expected: FAIL with missing exports for `shouldShowQueuedBlock` and `getRestoredQueuedTextOnArrowUp`.

- [ ] **Step 4: Add the minimal input helpers and props**

Add these props to [`ChatInput.tsx`](/home/lagz0ne/dev/kanna/src/client/components/chat-ui/ChatInput.tsx):

```typescript
  queuedText?: string
  onClearQueuedText?: () => void
  onRestoreQueuedText?: () => string
```

Add helper exports:

```typescript
export function shouldShowQueuedBlock(queuedText: string): boolean {
  return queuedText.trim().length > 0
}

export function getRestoredQueuedTextOnArrowUp(value: string, queuedText: string): string | null {
  if (value.trim().length > 0) return null
  return queuedText.trim().length > 0 ? queuedText : null
}
```

- [ ] **Step 5: Wire queue UI and ArrowUp behavior**

In [`ChatInput.tsx`](/home/lagz0ne/dev/kanna/src/client/components/chat-ui/ChatInput.tsx):

```typescript
  async function handleRestoreQueuedText() {
    const restored = onRestoreQueuedText?.()
    if (!restored) return
    setValue(restored)
    if (chatId) setDraft(chatId, restored)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowUp") {
      const restored = getRestoredQueuedTextOnArrowUp(value, queuedText ?? "")
      if (restored) {
        event.preventDefault()
        void handleRestoreQueuedText()
        return
      }
    }
    // existing key handling continues below
  }
```

Render the queue block above the existing composer shell:

```tsx
      {shouldShowQueuedBlock(queuedText ?? "") ? (
        <div className={cn("px-3 pb-2", isStandalone && "px-5")}>
          <div className="max-w-[840px] mx-auto rounded-2xl border border-border/70 bg-background/95 px-4 py-3 text-sm whitespace-pre-wrap">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Queue</span>
              <Button type="button" variant="ghost" size="sm" onClick={onClearQueuedText}>Clear</Button>
            </div>
            <div>{queuedText}</div>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 6: Re-run the targeted input test**

Run:

```bash
bun test src/client/components/chat-ui/ChatInput.test.ts
```

Expected: PASS for the queue helper coverage and existing `resolvePlanModeState` coverage.

- [ ] **Step 7: Commit the queue UI slice**

```bash
git add src/client/components/chat-ui/ChatInput.tsx src/client/components/chat-ui/ChatInput.test.ts
git commit -m "feat: add chat queue composer UI"
```

### Task 4: Wire `ChatPage`, verify behavior, and finish the C3 audit/update

**Files:**
- Modify: `src/client/app/ChatPage.tsx`
- Modify: `src/client/app/useKannaState.ts`
- Modify: `src/client/components/chat-ui/ChatInput.tsx`
- Verify: `src/client/app/useKannaState.test.ts`
- Verify: `src/client/components/chat-ui/ChatInput.test.ts`

- [ ] **Step 1: Thread the new queue props through `ChatPage`**

Change the composer callsite in [`ChatPage.tsx`](/home/lagz0ne/dev/kanna/src/client/app/ChatPage.tsx):

```tsx
          <ChatInput
            ref={chatInputRef}
            key={state.activeChatId ?? "new-chat"}
            onSubmit={state.handleSubmitFromComposer}
            onCancel={() => {
              void state.handleCancel()
            }}
            queuedText={state.queuedText}
            onClearQueuedText={state.clearQueuedText}
            onRestoreQueuedText={state.restoreQueuedText}
            disabled={!state.hasSelectedProject || state.runtime?.status === "waiting_for_user"}
            canCancel={state.canCancel}
            chatId={state.activeChatId}
            activeProvider={state.runtime?.provider ?? null}
            availableProviders={state.availableProviders}
            availableSkills={availableSkills}
          />
```

- [ ] **Step 2: Run the focused client test suite**

Run:

```bash
bun test src/client/app/useKannaState.test.ts
bun test src/client/components/chat-ui/ChatInput.test.ts
```

Expected: PASS for both targeted suites.

- [ ] **Step 3: Run build verification**

Run:

```bash
bun run build
```

Expected: PASS.

If `bunx @typescript/native-preview --noEmit -p tsconfig.json` still fails because of the known repo-level `baseUrl` incompatibility, record that as a pre-existing verification limitation rather than blocking the feature.

- [ ] **Step 4: Do the no-slop, simplify, and review passes**

Review these exact points:

```text
No-slop pass:
- Remove any queue code that duplicates existing send logic instead of delegating to handleSend().
- Remove any extra state that is not required to support queuedText, restore, or flush.

Simplify pass:
- Collapse tiny wrappers if they only forward values.
- Keep queue logic in useKannaState and presentation in ChatInput.

Review pass:
- Confirm queued flush preserves provider/model/modelOptions.
- Confirm busy submit never fires a socket command immediately.
- Confirm ArrowUp restore is blocked when the textarea already has text.
```

- [ ] **Step 5: Run the C3 compliance/audit gate**

Run:

```bash
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/app/useKannaState.ts
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/app/ChatPage.tsx
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh lookup src/client/components/chat-ui/ChatInput.tsx
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected: `c3x check` returns zero issues.

Document the ref/rule compliance inline in the implementation notes:

```text
ref-ref-websocket-protocol: queue remains client-side until handleSend flush
ref-ref-zustand-stores: no unrelated global store sprawl added
ref-ref-provider-abstraction: queued sends reuse the same provider/model options
rule-bun-test-conventions: new tests are Bun/co-located/describe+test
rule-prefixed-logging: any new logs use [useKannaState] or [ChatInput]
rule-rule-strict-typescript: no any, no untyped queue payloads
```

- [ ] **Step 6: Mark the ADR implemented and commit the integration**

Run:

```bash
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh set adr-20260401-queued-follow-up-messages status implemented
git add src/client/app/ChatPage.tsx src/client/app/useKannaState.ts src/client/app/useKannaState.test.ts src/client/components/chat-ui/ChatInput.tsx src/client/components/chat-ui/ChatInput.test.ts .c3/c3.db
git commit -m "feat: stage follow-up chat prompts in a client queue"
```

## Spec Coverage Check

- Queue while busy: covered by Task 2 wrapper logic and Task 3 UI updates.
- Multi-paragraph queue block: covered by Task 3 render changes.
- `ArrowUp` restore/unqueue: covered by Task 3 helper + key handling.
- Auto-send on idle: covered by Task 2 flush effect.
- Provider/model option parity: covered by Task 2 queued options retention and Task 4 review gate.
- C3 update/audit: covered by Task 4 compliance and ADR completion.

## Known Verification Note

The repo already has a known incompatibility with `bunx @typescript/native-preview --noEmit -p tsconfig.json` because of `tsconfig.json` `baseUrl`. Do not claim that check passes unless it is actually fixed in this branch.
