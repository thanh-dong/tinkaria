# Frontend Un-Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all currently-audited frontend violations of `rule-react-no-effects` while preserving the allowed boundary hooks that legitimately synchronize Kanna with external systems.

**Architecture:** Execute in four phases. First move queue/workflow and mirrored state ownership out of Effects and into explicit derivation, store actions, or keyed draft boundaries. Then clean up modal/dialog reset logic, replace the presentation-only empty-state typing Effect, and finish with a focused re-audit plus verification.

**Tech Stack:** React 19, TypeScript, Zustand, Bun test, React Router, existing Kanna client stores, C3

---

### Task 1: Queue Workflow Core In `useKannaState`

**Files:**
- Create: `src/client/stores/chatQueueStore.ts`
- Modify: `src/client/app/useKannaState.ts`
- Test: `src/client/app/useKannaState.test.ts`

- [ ] **Step 1: Write the failing queue workflow tests**

```ts
test("queues follow-up text without an effect-driven flush loop", async () => {
  const socket = createMockSocket()
  socket.chatStatus = "running"

  const { result } = renderHook(() => useKannaState("chat-1"), { wrapper: createWrapper(socket) })

  await act(async () => {
    const outcome = await result.current.handleSubmitFromComposer("next prompt")
    expect(outcome).toBe("queued")
  })

  expect(result.current.queuedText).toBe("next prompt")
  expect(socket.command).not.toHaveBeenCalledWith(expect.objectContaining({ type: "chat.send", content: "next prompt" }))
})

test("flushes queued text from an explicit queue transition when chat becomes idle", async () => {
  const socket = createMockSocket()
  const { result } = renderHook(() => useKannaState("chat-1"), { wrapper: createWrapper(socket) })

  await queueFollowUp(result, "next prompt")
  act(() => socket.emitChatSnapshot({ status: "idle" }))

  await waitFor(() => {
    expect(socket.command).toHaveBeenCalledWith(expect.objectContaining({ type: "chat.send", content: "next prompt" }))
  })
})

test("derives active project selection without effect-driven repair", async () => {
  const socket = createMockSocket()
  socket.emitSidebar(makeSidebar(["project-a"]))
  const { result } = renderHook(() => useKannaState(null), { wrapper: createWrapper(socket) })

  await waitFor(() => {
    expect(result.current.hasSelectedProject).toBe(true)
  })
})
```

- [ ] **Step 2: Run the targeted tests to verify the current implementation fails the new contract**

Run:
```bash
bun test src/client/app/useKannaState.test.ts
```

Expected: FAIL on the new queue/store assertions because the current implementation still uses Effect-driven flush coordination and selected-project repair.

- [ ] **Step 3: Add a focused queue store**

```ts
import { create } from "zustand"

type QueueOptions = {
  provider?: AgentProvider
  model?: string
  modelOptions?: ModelOptions
  planMode?: boolean
}

type ChatQueueState = {
  queuedTextByChat: Record<string, string>
  blockedFlushKeyByChat: Record<string, string | null>
  awaitingBusyByChat: Record<string, boolean>
  optionsByChat: Record<string, QueueOptions | undefined>
  append(chatId: string, content: string, options?: QueueOptions): void
  clear(chatId: string): void
  markAwaitingBusy(chatId: string, value: boolean): void
  markBlocked(chatId: string, key: string | null): void
}

export const useChatQueueStore = create<ChatQueueState>((set) => ({
  queuedTextByChat: {},
  blockedFlushKeyByChat: {},
  awaitingBusyByChat: {},
  optionsByChat: {},
  append: (chatId, content, options) => set((state) => ({
    queuedTextByChat: {
      ...state.queuedTextByChat,
      [chatId]: state.queuedTextByChat[chatId]
        ? `${state.queuedTextByChat[chatId]}\n\n${content}`
        : content,
    },
    optionsByChat: {
      ...state.optionsByChat,
      [chatId]: options,
    },
    blockedFlushKeyByChat: {
      ...state.blockedFlushKeyByChat,
      [chatId]: null,
    },
  })),
  clear: (chatId) => set((state) => {
    const queuedTextByChat = { ...state.queuedTextByChat }
    const optionsByChat = { ...state.optionsByChat }
    delete queuedTextByChat[chatId]
    delete optionsByChat[chatId]
    return { queuedTextByChat, optionsByChat }
  }),
  markAwaitingBusy: (chatId, value) => set((state) => ({
    awaitingBusyByChat: { ...state.awaitingBusyByChat, [chatId]: value },
  })),
  markBlocked: (chatId, key) => set((state) => ({
    blockedFlushKeyByChat: { ...state.blockedFlushKeyByChat, [chatId]: key },
  })),
}))
```

- [ ] **Step 4: Refactor `useKannaState` to use explicit transitions instead of the queue flush Effect**

```ts
const queuedText = activeChatId ? useChatQueueStore((s) => s.queuedTextByChat[activeChatId] ?? "") : ""

async function flushQueuedChat(chatId: string) {
  const store = useChatQueueStore.getState()
  const text = store.queuedTextByChat[chatId]?.trim()
  if (!text) return

  store.clear(chatId)
  store.markAwaitingBusy(chatId, true)

  try {
    await handleSend(text, store.optionsByChat[chatId])
    store.markBlocked(chatId, null)
  } catch {
    store.append(chatId, text, store.optionsByChat[chatId])
    store.markAwaitingBusy(chatId, false)
    store.markBlocked(chatId, getQueuedFlushKey(chatId, text))
  }
}

async function handleSubmitFromComposer(content: string, options?: QueueOptions) {
  if (!activeChatId) {
    await handleSend(content, options)
    return "sent"
  }

  if (shouldQueueChatSubmit(isProcessing, queuedText)) {
    useChatQueueStore.getState().append(activeChatId, content, options)
    return "queued"
  }

  await handleSend(content, options)
  return "sent"
}
```

- [ ] **Step 5: Remove effect-driven selected-project repair by deriving the fallback project directly**

```ts
const derivedProjectId =
  activeChatSnapshot?.runtime.projectId
  ?? selectedProjectId
  ?? sidebarData.projectGroups[0]?.groupKey
  ?? null

const hasSelectedProject = Boolean(
  derivedProjectId
  ?? fallbackLocalProjectPath
)
```

- [ ] **Step 6: Run the targeted queue tests and keep iterating until they pass**

Run:
```bash
bun test src/client/app/useKannaState.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit Phase 1 queue core**

```bash
git add src/client/stores/chatQueueStore.ts src/client/app/useKannaState.ts src/client/app/useKannaState.test.ts
git commit -m "refactor: remove effect-driven chat queue workflow"
```

### Task 2: Remove Mirrored Composer State In `ChatInput`

**Files:**
- Modify: `src/client/components/chat-ui/ChatInput.tsx`
- Test: `src/client/components/chat-ui/ChatInput.test.ts`

- [ ] **Step 1: Write failing tests for locked composer state without synchronization Effects**

```ts
test("recomputes locked composer state from the active provider without mirroring effect state", () => {
  render(
    <ChatInput
      activeProvider="codex"
      availableProviders={providers}
      disabled={false}
      onSubmit={mockSubmit}
    />
  )

  expect(screen.getByDisplayValue("codex-mini-latest")).toBeInTheDocument()
})

test("focuses the textarea when chat identity changes", async () => {
  const { rerender } = render(<TestChatInput chatId="chat-1" />)
  rerender(<TestChatInput chatId="chat-2" />)
  expect(screen.getByRole("textbox")).toHaveFocus()
})
```

- [ ] **Step 2: Run the focused test file**

Run:
```bash
bun test src/client/components/chat-ui/ChatInput.test.ts
```

Expected: FAIL on the new locked-composer expectations before the refactor.

- [ ] **Step 3: Replace `lockedComposerState` effect mirroring with explicit derivation and event-owned updates**

```ts
const [lockedOverrides, setLockedOverrides] = useState<Partial<ComposerState> | null>(null)

const lockedBaseState = activeProvider
  ? createLockedComposerState(activeProvider, composerState, providerDefaults)
  : null

const providerPrefs = activeProvider && lockedBaseState
  ? { ...lockedBaseState, ...lockedOverrides }
  : composerState

function resetLockedOverrides() {
  setLockedOverrides(null)
}
```

- [ ] **Step 4: Move chat/provider identity resets to explicit points**

```ts
const previousChatIdRef = useRef(chatId)
if (previousChatIdRef.current !== chatId) {
  previousChatIdRef.current = chatId
  resetLockedOverrides()
}
```

or use a keyed inner composer subtree:

```tsx
return (
  <ChatInputBody
    key={`${chatId ?? "__new__"}:${activeProvider ?? "unlocked"}`}
    {...props}
  />
)
```

- [ ] **Step 5: Keep auto-resize and focus only as allowed boundary behavior**

```ts
useLayoutEffect(() => {
  autoResize()
}, [value, autoResize])

useEffect(() => {
  textareaRef.current?.focus()
}, [chatId])
```

- [ ] **Step 6: Re-run the focused tests**

Run:
```bash
bun test src/client/components/chat-ui/ChatInput.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the ChatInput phase**

```bash
git add src/client/components/chat-ui/ChatInput.tsx src/client/components/chat-ui/ChatInput.test.ts
git commit -m "refactor: remove mirrored composer effect state"
```

### Task 3: Replace Draft Mirroring In `SettingsPage`

**Files:**
- Modify: `src/client/app/SettingsPage.tsx`
- Test: `src/client/app/SettingsPage.test.tsx`

- [ ] **Step 1: Add failing tests for keyed or explicit draft resets**

```ts
test("does not overwrite an in-progress terminal draft on unrelated re-render", async () => {
  render(<TestSettingsPage />)
  const input = screen.getByLabelText(/Scrollback lines/i)
  await user.type(input, "999")
  rerenderWithSameBackingState()
  expect(input).toHaveValue("999")
})

test("resets drafts when the backing settings identity changes", async () => {
  render(<TestSettingsPage />)
  updateTerminalPreferencesStore({ scrollbackLines: 2000 })
  rerenderWithNewBackingState()
  expect(screen.getByLabelText(/Scrollback lines/i)).toHaveValue("2000")
})
```

- [ ] **Step 2: Run the settings tests**

Run:
```bash
bun test src/client/app/SettingsPage.test.tsx
```

Expected: FAIL on the new draft-identity assertions.

- [ ] **Step 3: Extract draft-owning keyed sections instead of effect-mirrored local state**

```tsx
function GeneralSettingsDrafts(props: {
  scrollbackLines: number
  minColumnWidth: number
  editorCommandTemplate: string
  onCommitScrollback(value: number): void
  onCommitMinColumnWidth(value: number): void
  onCommitEditorCommand(value: string): void
}) {
  const [scrollbackDraft, setScrollbackDraft] = useState(String(props.scrollbackLines))
  const [minColumnWidthDraft, setMinColumnWidthDraft] = useState(String(props.minColumnWidth))
  const [editorCommandDraft, setEditorCommandDraft] = useState(props.editorCommandTemplate)
  // render inputs here
}
```

- [ ] **Step 4: Key the draft-owning sections by the backing values that should reset them**

```tsx
<GeneralSettingsDrafts
  key={`${scrollbackLines}:${minColumnWidth}:${editorCommandTemplate}`}
  scrollbackLines={scrollbackLines}
  minColumnWidth={minColumnWidth}
  editorCommandTemplate={editorCommandTemplate}
  onCommitScrollback={setScrollbackLines}
  onCommitMinColumnWidth={setMinColumnWidth}
  onCommitEditorCommand={setEditorCommandTemplate}
/>
```

- [ ] **Step 5: Do the same for keybinding drafts**

```tsx
<KeybindingsDrafts
  key={JSON.stringify(resolvedKeybindings.bindings)}
  resolvedKeybindings={resolvedKeybindings}
  onCommit={commitKeybindings}
/>
```

- [ ] **Step 6: Re-run the settings tests**

Run:
```bash
bun test src/client/app/SettingsPage.test.tsx
```

Expected: PASS

- [ ] **Step 7: Commit the settings phase**

```bash
git add src/client/app/SettingsPage.tsx src/client/app/SettingsPage.test.tsx
git commit -m "refactor: replace settings draft mirror effects"
```

### Task 4: Modal And Dialog Reset Cleanup

**Files:**
- Modify: `src/client/components/NewProjectModal.tsx`
- Modify: `src/client/components/ui/app-dialog.tsx`
- Create: `src/client/components/ui/app-dialog.test.tsx`

- [ ] **Step 1: Add failing tests for reset-on-open without effect mirroring**

```ts
test("new project modal resets state when reopened", async () => {
  render(<TestNewProjectModal />)
  await user.type(screen.getByPlaceholderText("Project name"), "draft")
  closeAndReopenModal()
  expect(screen.getByPlaceholderText("Project name")).toHaveValue("")
})

test("prompt dialog seeds initial value from dialog identity", async () => {
  const { result } = renderHook(() => useAppDialog(), { wrapper: AppDialogProvider })
  void act(() => result.current.prompt({ title: "Rename", initialValue: "alpha" }))
  expect(await screen.findByDisplayValue("alpha")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the modal/dialog tests**

Run:
```bash
bun test src/client/components/ui/app-dialog.test.tsx src/client/app/SettingsPage.test.tsx
```

Expected: FAIL until the reset behavior is moved off the Effects.

- [ ] **Step 3: Refactor `NewProjectModal` to reset from open identity rather than an Effect**

```tsx
const modalKey = open ? "open" : "closed"

return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent key={modalKey} size="sm">
      <NewProjectModalBody onConfirm={onConfirm} onOpenChange={onOpenChange} />
    </DialogContent>
  </Dialog>
)
```

or initialize from the explicit open handler owned by the caller if the dialog shell already supports that cleanly.

- [ ] **Step 4: Refactor `AppDialogProvider` so prompt state is derived from dialog identity**

```tsx
const promptKey = dialogState?.kind === "prompt"
  ? `${dialogState.options.title}:${dialogState.options.initialValue ?? ""}`
  : "none"

{dialogState?.kind === "prompt" ? (
  <PromptDialogBody
    key={promptKey}
    initialValue={dialogState.options.initialValue ?? ""}
    onCancel={resolveCancel}
    onConfirm={dialogState.resolve}
  />
) : null}
```

- [ ] **Step 5: Keep focus behavior only where it remains a real DOM boundary**

```ts
useEffect(() => {
  inputRef.current?.focus()
  inputRef.current?.select()
}, [])
```

That Effect is acceptable only inside the small keyed prompt body that owns the actual input mount lifecycle.

- [ ] **Step 6: Re-run the modal/dialog tests**

Run:
```bash
bun test src/client/components/ui/app-dialog.test.tsx
```

Expected: PASS

- [ ] **Step 7: Commit the modal/dialog phase**

```bash
git add src/client/components/NewProjectModal.tsx src/client/components/ui/app-dialog.tsx src/client/components/ui/app-dialog.test.tsx
git commit -m "refactor: remove effect-driven dialog resets"
```

### Task 5: Replace The `ChatPage` Empty-State Typing Effect

**Files:**
- Modify: `src/client/app/ChatPage.tsx`
- Test: `src/client/app/ChatPage.test.ts`

- [ ] **Step 1: Add a failing test for the new empty-state primitive**

```ts
test("renders the empty-state prompt without a page-owned typing effect", () => {
  render(<TestChatPage messages={[]} />)
  expect(screen.getByText(/What are we building\?/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the chat page tests**

Run:
```bash
bun test src/client/app/ChatPage.test.ts
```

Expected: FAIL after adding assertions for the new primitive until the old effect state is removed.

- [ ] **Step 3: Replace the page-owned interval state with a dedicated presentation primitive**

```tsx
function EmptyStatePrompt({ chatId }: { chatId: string | null }) {
  return (
    <span key={chatId ?? "__new__"} className="kanna-empty-state-prompt">
      What are we building?
    </span>
  )
}
```

If a typing treatment must remain, keep it inside this component with CSS-driven reveal classes rather than an Effect in `ChatPage`.

- [ ] **Step 4: Remove the page-level `typedEmptyStateText` and `isEmptyStateTypingComplete` state**

```tsx
{state.messages.length === 0 ? (
  <EmptyStatePrompt chatId={state.activeChatId} />
) : (
  <KannaTranscript ... />
)}
```

- [ ] **Step 5: Re-run the chat page tests**

Run:
```bash
bun test src/client/app/ChatPage.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit the presentation cleanup**

```bash
git add src/client/app/ChatPage.tsx src/client/app/ChatPage.test.ts
git commit -m "refactor: remove chat page typing effect"
```

### Task 6: Re-Audit, Verify, And Finish

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run the focused frontend test suite**

Run:
```bash
bun test src/client/app/useKannaState.test.ts
bun test src/client/components/chat-ui/ChatInput.test.ts
bun test src/client/app/SettingsPage.test.tsx
bun test src/client/components/ui/app-dialog.test.tsx
bun test src/client/app/ChatPage.test.ts
```

Expected: PASS

- [ ] **Step 2: Run build and C3 verification**

Run:
```bash
bun run build
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected: PASS

- [ ] **Step 3: Re-run the frontend effect audit**

Run:
```bash
rg -n '\buseEffect\b|\buseLayoutEffect\b' src/client --glob '*.ts' --glob '*.tsx'
```

Expected:
- remaining results are boundary-only hooks/components
- no remaining confirmed violations in `useKannaState.ts`, `ChatInput.tsx`, `SettingsPage.tsx`, `NewProjectModal.tsx`, `app-dialog.tsx`, or `ChatPage.tsx`

- [ ] **Step 4: Update the handoff note**

```md
## Completed: Frontend Un-Effect Master Plan Execution

**Status**: Verified.

**Phases shipped**:
1. queue/workflow state
2. settings and composer mirror-state removal
3. modal/dialog reset cleanup
4. chat page presentation cleanup

**Verified**:
1. focused Bun tests
2. `bun run build`
3. `c3x check`
4. final frontend effect audit
```

- [ ] **Step 5: Commit the verification pass**

```bash
git add tasks/todo.md
git commit -m "docs: record frontend un-effect verification"
```
