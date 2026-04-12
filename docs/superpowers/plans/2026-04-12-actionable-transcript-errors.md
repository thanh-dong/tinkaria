# Actionable Transcript Error Messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every error message in the chat transcript actionable — telling the user what happened, why, and what they can do next, with interactive buttons where possible.

**Architecture:** Component-local enrichment. Pure `enrichCommandError()` function transforms raw strings at render time (no state type changes). A `TranscriptActionsContext` delivers callbacks to transcript components without prop drilling. Each of the 7 error sites gets improved copy + contextual hints + action buttons.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, lucide-react icons, Bun test runner

---

### Task 1: Types + enrichCommandError helper (TDD)

**Files:**
- Modify: `src/client/app/appState.helpers.ts`
- Modify: `src/client/app/appState.helpers.test.ts`

- [ ] **Step 1: Write failing tests for EnrichedError types and enrichCommandError**

Add to `src/client/app/appState.helpers.test.ts`:

```ts
import {
  enrichCommandError,
  type EnrichedError,
} from "./appState.helpers"

describe("enrichCommandError", () => {
  test("enriches 'not connected' with server hint and dismiss action", () => {
    const result = enrichCommandError("not connected")
    expect(result.message).toBe("Can't reach the server")
    expect(result.hint).toBe("Make sure Tinkaria is running on this machine.")
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })

  test("enriches connection closed with reconnecting hint", () => {
    const result = enrichCommandError("WebSocket connection closed unexpectedly")
    expect(result.message).toBe("Connection dropped")
    expect(result.hint).toBe("Reconnecting automatically...")
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })

  test("enriches socket closed with reconnecting hint", () => {
    const result = enrichCommandError("socket closed")
    expect(result.message).toBe("Connection dropped")
  })

  test("enriches version mismatch with restart hint", () => {
    const result = enrichCommandError("Unknown command type: system.readLocalFilePreview")
    expect(result.message).toBe("Client is newer than server")
    expect(result.hint).toBe("Restart Tinkaria to enable in-app file previews.")
  })

  test("passes through unknown errors with no hint", () => {
    const result = enrichCommandError("Something weird happened")
    expect(result.message).toBe("Something weird happened")
    expect(result.hint).toBeUndefined()
    expect(result.actions).toEqual([
      { label: "Dismiss", variant: "ghost", action: "dismiss" },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/app/appState.helpers.test.ts --filter "enrichCommandError"`

Expected: FAIL — `enrichCommandError` is not exported

- [ ] **Step 3: Implement types and enrichCommandError**

Add to `src/client/app/appState.helpers.ts` (after the imports, before `PendingSessionBootstrap`):

```ts
export interface ErrorAction {
  label: string
  variant: "default" | "ghost" | "destructive"
  action: string
}

export interface EnrichedError {
  message: string
  hint?: string
  actions?: ErrorAction[]
}

const DISMISS_ACTION: ErrorAction = { label: "Dismiss", variant: "ghost", action: "dismiss" }

export function enrichCommandError(raw: string): EnrichedError {
  const lower = raw.toLowerCase().trim()

  if (lower === "not connected") {
    return {
      message: "Can't reach the server",
      hint: `Make sure ${APP_NAME} is running on this machine.`,
      actions: [DISMISS_ACTION],
    }
  }

  if (lower.includes("connection closed") || lower.includes("socket closed")) {
    return {
      message: "Connection dropped",
      hint: "Reconnecting automatically...",
      actions: [DISMISS_ACTION],
    }
  }

  if (raw.includes("Unknown command type: system.readLocalFilePreview")) {
    return {
      message: "Client is newer than server",
      hint: `Restart ${APP_NAME} to enable in-app file previews.`,
      actions: [DISMISS_ACTION],
    }
  }

  return {
    message: raw.trim(),
    actions: [DISMISS_ACTION],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/app/appState.helpers.test.ts --filter "enrichCommandError"`

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/client/app/appState.helpers.ts src/client/app/appState.helpers.test.ts
git commit -m "feat: add EnrichedError types and enrichCommandError helper (TDD)"
```

---

### Task 2: getToolErrorHint helper (TDD)

**Files:**
- Modify: `src/client/components/messages/ToolCallMessage.tsx`

- [ ] **Step 1: Write failing test for getToolErrorHint**

Create `src/client/components/messages/ToolCallMessage.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { getToolErrorHint } from "./ToolCallMessage"

describe("getToolErrorHint", () => {
  test("returns permission hint for permission denied errors", () => {
    expect(getToolErrorHint("Error: EACCES: permission denied, open '/etc/shadow'"))
      .toBe("The tool couldn't access a file. Check file permissions.")
  })

  test("returns command hint for command not found errors", () => {
    expect(getToolErrorHint("bash: foobar: command not found"))
      .toBe("The command isn't installed or isn't in PATH.")
  })

  test("returns timeout hint for timeout errors", () => {
    expect(getToolErrorHint("Operation timed out after 30000ms"))
      .toBe("The operation took too long.")
  })

  test("returns timeout hint for 'timeout' variant", () => {
    expect(getToolErrorHint("Request timeout exceeded"))
      .toBe("The operation took too long.")
  })

  test("returns file hint for ENOENT errors", () => {
    expect(getToolErrorHint("Error: ENOENT: no such file or directory, open '/missing'"))
      .toBe("A referenced file or directory doesn't exist.")
  })

  test("returns null for unrecognized hard errors", () => {
    expect(getToolErrorHint("TypeError: Cannot read properties of undefined"))
      .toBeNull()
  })

  test("returns null for empty strings", () => {
    expect(getToolErrorHint("")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/messages/ToolCallMessage.test.ts`

Expected: FAIL — `getToolErrorHint` is not exported

- [ ] **Step 3: Implement getToolErrorHint**

Add to `src/client/components/messages/ToolCallMessage.tsx` (after the `isSoftError` function, before `TOOL_CALL_ITEM_DESCRIPTOR`):

```ts
const TOOL_ERROR_HINTS: Array<{ pattern: string; hint: string }> = [
  { pattern: "permission denied", hint: "The tool couldn't access a file. Check file permissions." },
  { pattern: "command not found", hint: "The command isn't installed or isn't in PATH." },
  { pattern: "timed out", hint: "The operation took too long." },
  { pattern: "timeout", hint: "The operation took too long." },
  { pattern: "enoent", hint: "A referenced file or directory doesn't exist." },
  { pattern: "no such file", hint: "A referenced file or directory doesn't exist." },
]

export function getToolErrorHint(result: string): string | null {
  if (!result) return null
  const lower = result.toLowerCase()
  for (const { pattern, hint } of TOOL_ERROR_HINTS) {
    if (lower.includes(pattern)) return hint
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/client/components/messages/ToolCallMessage.test.ts`

Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/client/components/messages/ToolCallMessage.tsx src/client/components/messages/ToolCallMessage.test.ts
git commit -m "feat: add getToolErrorHint for actionable tool error hints (TDD)"
```

---

### Task 3: TranscriptActionsContext

**Files:**
- Create: `src/client/app/TranscriptActionsContext.ts`

- [ ] **Step 1: Create the context file**

Create `src/client/app/TranscriptActionsContext.ts`:

```ts
import { createContext, useContext } from "react"

export interface TranscriptActions {
  onRetryChat: () => void
  onNewChat: () => void
  onResumeSession: (() => void) | null
  onDismissError: () => void
  onRetryBootstrap: (() => void) | null
}

export const TranscriptActionsContext = createContext<TranscriptActions | null>(null)

export function useTranscriptActions(): TranscriptActions | null {
  return useContext(TranscriptActionsContext)
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit src/client/app/TranscriptActionsContext.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/app/TranscriptActionsContext.ts
git commit -m "feat: add TranscriptActionsContext for error action callbacks"
```

---

### Task 4: Wire TranscriptActionsContext in ChatPage

**Files:**
- Modify: `src/client/app/ChatPage.tsx`

- [ ] **Step 1: Add import and provider wiring**

In `src/client/app/ChatPage.tsx`, add the import:

```ts
import { TranscriptActionsContext, type TranscriptActions } from "./TranscriptActionsContext"
```

Find the section around line 570 where the transcript scroll area begins (containing `<ChatTranscript`). Wrap the transcript content area (from `<div className="flex flex-col ...` through `</div>` that contains `ProcessingMessage` and the command error banner) with the context provider.

Create the actions value using `useMemo` inside the `ChatPageContent` component (or wherever `state` is in scope):

```ts
const transcriptActions = useMemo<TranscriptActions>(() => ({
  onRetryChat: () => {
    const workspaceId = state.sidebarData.workspaceGroups.find(
      (g) => g.chats.some((c) => c.chatId === state.activeChatId)
    )?.chats[0]?.chatId
    if (workspaceId) void state.handleCreateChat(workspaceId)
  },
  onNewChat: () => {
    const group = state.sidebarData.workspaceGroups.find(
      (g) => g.chats.some((c) => c.chatId === state.activeChatId)
    )
    if (group) void state.handleCreateChat(group.groupKey)
  },
  onResumeSession: null,
  onDismissError: () => {
    // Clear commandError — this requires exposing a setter or using existing dismiss
  },
  onRetryBootstrap: state.pendingSessionBootstrap?.phase === "error"
    ? () => state.dismissBootstrapError()
    : null,
}), [state.activeChatId, state.sidebarData, state.pendingSessionBootstrap?.phase])
```

Wrap the transcript area:

```tsx
<TranscriptActionsContext.Provider value={transcriptActions}>
  {/* existing transcript content */}
</TranscriptActionsContext.Provider>
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/app/ChatPage.tsx
git commit -m "feat: wire TranscriptActionsContext provider in ChatPage"
```

---

### Task 5: Enrich commandError banner in ChatPage

**Files:**
- Modify: `src/client/app/ChatPage.tsx`

- [ ] **Step 1: Add enrichCommandError import**

In `src/client/app/ChatPage.tsx`, add to imports:

```ts
import { enrichCommandError } from "./appState.helpers"
```

- [ ] **Step 2: Replace plain commandError rendering with enriched version**

Find the command error banner (around line 593-600):

```tsx
{shouldRenderTranscriptCommandError({
  commandError: state.commandError,
  connectionStatus: state.connectionStatus,
}) ? (
  <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3">
    {state.commandError}
  </div>
) : null}
```

Replace with:

```tsx
{shouldRenderTranscriptCommandError({
  commandError: state.commandError,
  connectionStatus: state.connectionStatus,
}) && state.commandError ? (() => {
  const enriched = enrichCommandError(state.commandError)
  return (
    <div className="flex flex-col gap-2 text-sm border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3">
      <span className="font-medium text-destructive">{enriched.message}</span>
      {enriched.hint ? (
        <span className="text-muted-foreground text-xs">{enriched.hint}</span>
      ) : null}
      {enriched.actions && enriched.actions.length > 0 ? (
        <div className="flex gap-2 mt-1">
          {enriched.actions.map((action) => (
            <Button
              key={action.action}
              variant={action.variant === "default" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                if (action.action === "dismiss" && actions?.onDismissError) {
                  actions.onDismissError()
                }
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
})() : null}
```

The `actions` variable comes from `useTranscriptActions()` which is already available because this code runs inside the `TranscriptActionsContext.Provider` wired in Task 4. The `onDismissError` callback should set `commandError` to `null` — wire this in the provider's `onDismissError` implementation.

- [ ] **Step 3: Verify it renders correctly**

Run: `bun run dev` and trigger a command error (e.g., disconnect the server). Verify the enriched banner shows message + hint + dismiss button.

- [ ] **Step 4: Commit**

```bash
git add src/client/app/ChatPage.tsx
git commit -m "feat: render enriched command error banner with hints and dismiss"
```

---

### Task 6: ProcessingMessage failed state

**Files:**
- Modify: `src/client/components/messages/ProcessingMessage.tsx`

- [ ] **Step 1: Update ProcessingMessage with enriched failed state**

Replace the entire `src/client/components/messages/ProcessingMessage.tsx`:

```tsx
import { AlertCircle, Loader2 } from "lucide-react"
import { MetaRow, MetaContent } from "./shared"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import { Button } from "../ui/button"
import { useTranscriptActions } from "../../app/TranscriptActionsContext"

const STATUS_LABELS: Record<string, string> = {
  connecting: "Connecting...",
  acquiring_sandbox: "Booting...",
  initializing: "Initializing...",
  starting: "Starting...",
  running: "Running...",
  waiting_for_user: "Waiting...",
  failed: "Failed",
}

interface ProcessingMessageProps {
  status?: string
}

export function ProcessingMessage({ status }: ProcessingMessageProps) {
  const label = (status ? STATUS_LABELS[status] : undefined) || "Processing..."
  const isFailed = status === "failed"
  const actions = useTranscriptActions()

  if (isFailed) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 mx-2 my-1 rounded-lg bg-destructive/10 border border-destructive/20">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-destructive/60" />
          <span className="text-sm font-medium text-destructive">Session failed to start</span>
        </div>
        <span className="text-xs text-muted-foreground">
          The CLI process exited before it could respond.
        </span>
        <div className="flex gap-2 mt-1">
          {actions?.onRetryChat ? (
            <Button variant="ghost" size="sm" onClick={actions.onRetryChat}>
              Try again
            </Button>
          ) : null}
          {actions?.onDismissError ? (
            <Button variant="ghost" size="sm" onClick={actions.onDismissError}>
              Dismiss
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <MetaRow className="ml-[1px]">
      <MetaContent>
        <Loader2 className="size-4.5 animate-spin text-muted-icon" />
        <AnimatedShinyText className="ml-[1px] text-sm" shimmerWidth={44}>
          {label}
        </AnimatedShinyText>
      </MetaContent>
    </MetaRow>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/messages/ProcessingMessage.tsx
git commit -m "feat: ProcessingMessage shows actionable error with retry/dismiss on failure"
```

---

### Task 7: ResultMessage enriched error + cancelled hint

**Files:**
- Modify: `src/client/components/messages/ResultMessage.tsx`

- [ ] **Step 1: Add getResultErrorHint helper and update component**

Replace the entire `src/client/components/messages/ResultMessage.tsx`:

```tsx
import { memo } from "react"
import { AlertCircle, CircleSlash } from "lucide-react"
import type { ProcessedResultMessage } from "./types"
import { MetaRow, MetaLabel } from "./shared"
import { Button } from "../ui/button"
import { useTranscriptActions } from "../../app/TranscriptActionsContext"

function getResultErrorHint(result: string | undefined): string {
  if (!result) return "This usually means the CLI process crashed or was killed."
  const lower = result.toLowerCase()
  if (lower.includes("signal")) return "The process was interrupted by a system signal."
  if (lower.includes("oom") || lower.includes("out of memory")) return "The process ran out of memory."
  return "This usually means the CLI process crashed or was killed."
}

interface Props {
  message: ProcessedResultMessage
}

export const ResultMessage = memo(function ResultMessage({ message }: Props) {
  const actions = useTranscriptActions()

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`
    if (minutes > 0) return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`
    return `${seconds}s`
  }

  if (message.cancelled) {
    return (
      <div className="flex flex-col items-end gap-1.5 text-sm text-muted-foreground my-3">
        <div className="inline-flex gap-1.5 items-center justify-center whitespace-nowrap text-sm font-medium bg-background text-foreground/60 border border-border h-9 pl-1 pr-4 rounded-full">
          <CircleSlash className="h-4 w-4 ml-1.5" />
          <em>Interrupted</em>
        </div>
        <span className="text-xs text-muted-foreground/60 pr-1">
          Send a new message to continue this conversation.
        </span>
      </div>
    )
  }

  if (!message.success) {
    const resultText = typeof message.result === "string" ? message.result : undefined
    const hint = getResultErrorHint(resultText)

    return (
      <div className="flex flex-col gap-2 px-4 py-3 mx-2 my-1 rounded-lg bg-destructive/10 border border-destructive/20">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-destructive/60 shrink-0" />
          <span className="text-sm font-medium text-destructive">Session ended unexpectedly</span>
        </div>
        <span className="text-xs text-muted-foreground">{hint}</span>
        {resultText ? (
          <span className="text-xs text-muted-foreground/60 font-mono">{resultText}</span>
        ) : null}
        <div className="flex gap-2 mt-1">
          {actions?.onNewChat ? (
            <Button variant="default" size="sm" onClick={actions.onNewChat}>
              Start new chat
            </Button>
          ) : null}
          {actions?.onResumeSession ? (
            <Button variant="ghost" size="sm" onClick={actions.onResumeSession}>
              Resume session
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <MetaRow className={`px-0.5 text-xs tracking-wide ${message.durationMs > 60000 ? '' : 'hidden'}`}>
      <div className="w-full h-[1px] bg-border"></div>
      <MetaLabel className="whitespace-nowrap text-[11px] tracking-widest text-muted-foreground/60 uppercase flex-shrink-0">Worked for {formatDuration(message.durationMs)}</MetaLabel>
      <div className="w-full h-[1px] bg-border"></div>
    </MetaRow>
  )
})
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/messages/ResultMessage.tsx
git commit -m "feat: ResultMessage shows actionable error hints and interrupt guidance"
```

---

### Task 8: InterruptedMessage hint text

**Files:**
- Modify: `src/client/components/messages/InterruptedMessage.tsx`

- [ ] **Step 1: Add hint text below the pill**

Replace the entire `src/client/components/messages/InterruptedMessage.tsx`:

```tsx
import { memo } from "react"
import { CircleSlash } from "lucide-react"
import type { ProcessedInterruptedMessage } from "./types"

interface Props {
  message: ProcessedInterruptedMessage
}

export const InterruptedMessage = memo(function InterruptedMessage({ message: _message }: Props) {
  return (
    <div className="flex flex-col items-end gap-1.5 text-sm text-muted-foreground my-3">
      <div className="inline-flex gap-1.5 items-center justify-center whitespace-nowrap text-sm font-medium bg-background text-foreground/60 border border-border h-9 pl-1 pr-4 rounded-full">
        <CircleSlash className="h-4 w-4 ml-1.5" />
        <em>Interrupted</em>
      </div>
      <span className="text-xs text-muted-foreground/60 pr-1">
        Send a new message to continue this conversation.
      </span>
    </div>
  )
})
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/messages/InterruptedMessage.tsx
git commit -m "feat: InterruptedMessage shows continuation hint below pill"
```

---

### Task 9: ToolCallMessage error hint rendering

**Files:**
- Modify: `src/client/components/messages/ToolCallMessage.tsx`

- [ ] **Step 1: Render hint above error code block**

In `src/client/components/messages/ToolCallMessage.tsx`, find the `showGenericResult` rendering block (around line 127-138). Replace:

```tsx
{showGenericResult && (
  imageResult ? (
    <ImageContentView
      images={imageResult.images}
      text={imageResult.text}
    />
  ) : (
    <MetaCodeBlock label={message.isError ? "Error" : "Result"} copyText={resultText}>
      {resultText}
    </MetaCodeBlock>
  )
)}
```

With:

```tsx
{showGenericResult && (
  imageResult ? (
    <ImageContentView
      images={imageResult.images}
      text={imageResult.text}
    />
  ) : (
    <>
      {message.isError && !isSoftError(message.result) && (() => {
        const hint = getToolErrorHint(resultText)
        return hint ? (
          <span className="text-xs text-muted-foreground/70">{hint}</span>
        ) : null
      })()}
      <MetaCodeBlock label={message.isError ? "Error" : "Result"} copyText={resultText}>
        {resultText}
      </MetaCodeBlock>
    </>
  )
)}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/messages/ToolCallMessage.tsx
git commit -m "feat: ToolCallMessage shows contextual error hint above raw error"
```

---

### Task 10: SystemMessage MCP status labels + hints

**Files:**
- Modify: `src/client/components/messages/SystemMessage.tsx`

- [ ] **Step 1: Update statusLabel function and add hints**

In `src/client/components/messages/SystemMessage.tsx`, find the `statusLabel` function (around line 73-82). Replace:

```ts
function statusLabel(status: string): string {
  switch (status) {
    case "connected": return "Connected"
    case "failed": return "Failed"
    case "needs-auth": return "Needs auth"
    case "pending": return "Connecting..."
    case "disabled": return "Disabled"
    default: return status
  }
}
```

With:

```ts
function statusLabel(status: string): string {
  switch (status) {
    case "connected": return "Connected"
    case "failed": return "Connection failed"
    case "needs-auth": return "Needs authentication"
    case "pending": return "Connecting..."
    case "disabled": return "Disabled"
    default: return status
  }
}

function statusHint(status: string): string | null {
  switch (status) {
    case "failed": return "Check the MCP server process."
    case "needs-auth": return "Re-authenticate to reconnect."
    default: return null
  }
}
```

Then in `ExpandableMcpServer`, after the error rendering (around line 108-110):

```tsx
{!isConnected && server.error && (
  <span className="text-destructive ml-5">{server.error}</span>
)}
```

Add hint below:

```tsx
{!isConnected && !server.error && (() => {
  const hint = statusHint(server.status)
  return hint ? (
    <span className="text-xs text-muted-foreground/60 ml-5">{hint}</span>
  ) : null
})()}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/components/messages/SystemMessage.tsx
git commit -m "feat: SystemMessage shows actionable MCP status labels and hints"
```

---

### Task 11: Fork/Merge failed overlay — enriched hints + retry button

**Files:**
- Modify: `src/client/app/ChatPage.tsx`
- Modify: `src/client/app/appState.helpers.ts`

- [ ] **Step 1: Add bootstrap error hint enrichment**

In `src/client/app/appState.helpers.ts`, update `normalizeSessionBootstrapErrorMessage` to also handle "busy":

```ts
export function normalizeSessionBootstrapErrorMessage(
  kind: PendingSessionBootstrap["kind"],
  error: unknown,
): string {
  const normalized = normalizeCommandErrorMessage(error)
  const lower = normalized.toLowerCase()

  if (lower.includes("timeout") || lower.includes("timed out")) {
    if (kind === "fork") {
      return "Preparing the fork brief took too long. Try again with a tighter focus or a smaller source context."
    }
    return "Preparing the merged session brief took too long. Try again with fewer sessions or a tighter goal."
  }

  if (lower.includes("busy") || lower.includes("already running")) {
    return "The target session is currently busy. Wait for it to finish or pick a different session."
  }

  return normalized
}
```

- [ ] **Step 2: Update fork/merge error overlay in ChatPage**

In `src/client/app/ChatPage.tsx`, find the fork/merge error overlay (around line 636-653). Replace:

```tsx
<div className="pointer-events-auto flex flex-col items-center gap-3">
  <AlertCircle className="h-8 w-8 text-destructive/60" />
  <span className="text-sm font-medium text-destructive">
    {state.pendingSessionBootstrap.kind === "fork" ? "Fork" : "Merge"} failed
  </span>
  {state.pendingSessionBootstrap.errorMessage ? (
    <span className="max-w-sm text-center text-xs text-muted-foreground">
      {state.pendingSessionBootstrap.errorMessage}
    </span>
  ) : null}
  <Button
    variant="ghost"
    size="sm"
    onClick={() => state.dismissBootstrapError()}
  >
    Dismiss
  </Button>
</div>
```

With:

```tsx
<div className="pointer-events-auto flex flex-col items-center gap-3">
  <AlertCircle className="h-8 w-8 text-destructive/60" />
  <span className="text-sm font-medium text-destructive">
    {state.pendingSessionBootstrap.kind === "fork" ? "Fork" : "Merge"} failed
  </span>
  {state.pendingSessionBootstrap.errorMessage ? (
    <span className="max-w-sm text-center text-xs text-muted-foreground">
      {state.pendingSessionBootstrap.errorMessage}
    </span>
  ) : null}
  <div className="flex gap-2">
    <Button
      variant="ghost"
      size="sm"
      onClick={() => state.dismissBootstrapError()}
    >
      Dismiss
    </Button>
  </div>
</div>
```

Note: The "Try again" button for fork/merge retry (storing `retryParams` in `PendingSessionBootstrap`) is deferred to Phase 2 per the spec's retry strategy matrix. Phase 1 ships with dismiss-only, which already improves the UX significantly with better hint text.

- [ ] **Step 3: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/client/app/ChatPage.tsx src/client/app/appState.helpers.ts
git commit -m "feat: fork/merge overlay shows enriched error hints with busy detection"
```

---

### Task 12: Update existing tests

**Files:**
- Modify: `src/client/app/appState.helpers.test.ts`
- Modify: `src/client/app/ChatPage.test.tsx`
- Modify: `src/client/app/ChatPage.test.ts`

- [ ] **Step 1: Update appState.helpers tests for normalizeSessionBootstrapErrorMessage busy case**

Add to `src/client/app/appState.helpers.test.ts`:

```ts
import { normalizeSessionBootstrapErrorMessage } from "./appState.helpers"

describe("normalizeSessionBootstrapErrorMessage", () => {
  test("returns busy hint when error contains 'busy'", () => {
    const result = normalizeSessionBootstrapErrorMessage("fork", "Target chat is busy")
    expect(result).toBe("The target session is currently busy. Wait for it to finish or pick a different session.")
  })

  test("returns busy hint when error contains 'already running'", () => {
    const result = normalizeSessionBootstrapErrorMessage("merge", "Session already running")
    expect(result).toBe("The target session is currently busy. Wait for it to finish or pick a different session.")
  })
})
```

- [ ] **Step 2: Run all helpers tests**

Run: `bun test src/client/app/appState.helpers.test.ts`

Expected: All tests PASS

- [ ] **Step 3: Run ChatPage tests to check for regressions**

Run: `bun test src/client/app/ChatPage.test.tsx src/client/app/ChatPage.test.ts`

Check for failures. If tests check for exact `commandError` string rendering, update them to match the new enriched rendering (e.g., check for `"Can't reach the server"` instead of the old longer string).

- [ ] **Step 4: Commit**

```bash
git add src/client/app/appState.helpers.test.ts src/client/app/ChatPage.test.tsx src/client/app/ChatPage.test.ts
git commit -m "test: update tests for enriched error messages and bootstrap busy handling"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`

Expected: All tests pass. No regressions.

- [ ] **Step 2: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit`

Expected: No errors.

- [ ] **Step 3: Run build**

Run: `bun run check`

Expected: Build succeeds.

- [ ] **Step 4: Visual smoke test**

Run: `bun run dev`

Verify each error state:
1. ProcessingMessage failed — shows "Session failed to start" + hint + Try again/Dismiss buttons
2. ResultMessage failure — shows "Session ended unexpectedly" + contextual hint + Start new chat button
3. ResultMessage cancelled — shows "Interrupted" pill + "Send a new message" hint
4. InterruptedMessage — shows "Interrupted" pill + "Send a new message" hint
5. ToolCallMessage error — expand a failed tool call, see hint above error code block
6. Command error banner — disconnect server, see "Connection dropped" + "Reconnecting automatically..."
7. MCP server failed — see "Connection failed" + "Check the MCP server process."

- [ ] **Step 5: Final commit if any smoke test fixes needed**

```bash
git add -A
git commit -m "fix: address smoke test findings for actionable error messages"
```
