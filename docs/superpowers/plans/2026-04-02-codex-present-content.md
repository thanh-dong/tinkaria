# Codex Present Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Codex dynamic tool, `present_content`, so Codex can intentionally surface structured transcript artifacts through a typed tool path and dedicated transcript UI instead of relying only on assistant markdown.

**Architecture:** Extend the Codex app-server bridge to advertise one client-owned dynamic tool and handle its `item/tool/call` requests as a typed transcript tool. Persist the normalized structured payload as the tool result, then render it through a dedicated client transcript component that reuses the existing markdown and rich-content primitives. Keep markdown fallback behavior intact by making this an additive Codex-only capability.

**Tech Stack:** Bun, TypeScript, React 19, react-markdown, existing Kanna transcript hydration/rendering pipeline, C3

---

## File Structure

### Existing files to modify

- `src/server/codex-app-server-protocol.ts`
  Purpose: vendored typed app-server request/response model; needs `dynamicTools` request support.
- `src/server/codex-app-server.ts`
  Purpose: Codex app-server bridge; needs turn-start dynamic tool advertisement, `present_content` request handling, and typed transcript entry emission.
- `src/server/agent.ts`
  Purpose: Codex web-context prompt; needs additive `present_content` guidance.
- `src/shared/types.ts`
  Purpose: typed transcript tool/result model; needs `present_content` normalized and hydrated types.
- `src/shared/tools.ts`
  Purpose: normalized tool hydration; needs `present_content` result hydration.
- `src/client/app/KannaTranscript.tsx`
  Purpose: transcript renderer dispatch; needs a `present_content` branch.
- `src/client/components/messages/types.ts`
  Purpose: message type exports; needs the new hydrated tool type exported through `ProcessedToolCall`.

### New files to create

- `src/client/components/messages/PresentContentMessage.tsx`
  Purpose: dedicated transcript renderer for `present_content`, reusing markdown and rich-content primitives.
- `src/client/components/messages/PresentContentMessage.test.tsx`
  Purpose: focused UI tests for markdown, embed, and code-like presentation paths.

### Existing test files to modify

- `src/server/codex-app-server.test.ts`
- `src/shared/tools.test.ts`
- `src/client/lib/parseTranscript.test.ts`

### New test files to create

- `src/client/app/KannaTranscript.test.tsx`
  Purpose: transcript dispatch coverage for the new tool kind.

## Task 1: Add Protocol Coverage For Dynamic Tool Advertisement

**Files:**
- Modify: `src/server/codex-app-server.test.ts`
- Modify: `src/server/codex-app-server-protocol.ts`

- [ ] **Step 1: Write the failing test**

Add a new test near the existing `CodexAppServerManager` turn-start tests in `src/server/codex-app-server.test.ts`:

```ts
test("advertises present_content as a dynamic tool on turn start", async () => {
  const process = new FakeCodexProcess((message, child) => {
    if (message.method === "initialize") {
      child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      return
    }
    if (message.method === "thread/start") {
      child.writeServerMessage({
        id: message.id,
        result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
      })
      return
    }
    if (message.method === "turn/start") {
      expect(message.params.dynamicTools).toBeDefined()
      expect(Array.isArray(message.params.dynamicTools)).toBe(true)
      expect(message.params.dynamicTools).toContainEqual(
        expect.objectContaining({
          name: "present_content",
        })
      )
      child.writeServerMessage({
        id: message.id,
        result: { turn: { id: "turn-1", status: "inProgress", error: null } },
      })
      child.writeServerMessage({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "completed", error: null },
        },
      })
    }
  })

  const manager = new CodexAppServerManager({
    spawnProcess: () => process as never,
  })

  await manager.startSession({
    chatId: "chat-1",
    cwd: "/tmp/project",
    model: "gpt-5.4",
    sessionToken: null,
  })

  const turn = await manager.startTurn({
    chatId: "chat-1",
    model: "gpt-5.4",
    content: "show a card",
    planMode: false,
    onToolRequest: async () => ({}),
  })

  await collectStream(turn.stream)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/server/codex-app-server.test.ts -t "advertises present_content as a dynamic tool on turn start"
```

Expected: FAIL because `TurnStartParams` and/or `startTurn()` do not include `dynamicTools`.

- [ ] **Step 3: Write the minimal implementation**

Update `src/server/codex-app-server-protocol.ts` to add the minimal dynamic-tool type shapes used by the plan:

```ts
export interface DynamicToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface TurnStartParams {
  threadId: string
  input: CodexUserInput[]
  approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted" | null
  model?: string | null
  effort?: ReasoningEffort | null
  serviceTier?: ServiceTier | null
  collaborationMode?: CollaborationMode | null
  dynamicTools?: DynamicToolDefinition[] | null
}
```

Then update `src/server/codex-app-server.ts` so the `turn/start` request includes:

```ts
dynamicTools: [
  {
    name: "present_content",
    description: "Present a structured content artifact in the transcript.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: ["markdown", "code", "diagram"] },
        format: { type: "string" },
        source: { type: "string" },
        summary: { type: "string" },
        collapsed: { type: "boolean" },
      },
      required: ["title", "kind", "format", "source"],
      additionalProperties: false,
    },
  },
],
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test src/server/codex-app-server.test.ts -t "advertises present_content as a dynamic tool on turn start"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/codex-app-server-protocol.ts src/server/codex-app-server.ts src/server/codex-app-server.test.ts
git commit -m "test: cover codex present_content advertisement"
```

## Task 2: Add Shared Types And Hydration For `present_content`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/tools.ts`
- Modify: `src/shared/tools.test.ts`
- Modify: `src/client/lib/parseTranscript.test.ts`

- [ ] **Step 1: Write the failing shared-tool tests**

Add a normalize test in `src/shared/tools.test.ts`:

```ts
test("maps present_content input to a typed content payload", () => {
  const tool = normalizeToolCall({
    toolName: "present_content",
    toolId: "tool-4",
    input: {
      title: "System Design",
      kind: "diagram",
      format: "mermaid",
      source: "graph TD\\nA-->B",
      summary: "Current flow",
      collapsed: true,
    },
  })

  expect(tool.toolKind).toBe("present_content")
  if (tool.toolKind !== "present_content") throw new Error("unexpected tool kind")
  expect(tool.input.title).toBe("System Design")
  expect(tool.input.format).toBe("mermaid")
})
```

Add a hydrate test in `src/shared/tools.test.ts`:

```ts
test("hydrates present_content structured results", () => {
  const tool = normalizeToolCall({
    toolName: "present_content",
    toolId: "tool-5",
    input: {
      title: "Snippet",
      kind: "code",
      format: "typescript",
      source: "const x = 1",
    },
  })

  const result = hydrateToolResult(tool, {
    accepted: true,
    title: "Snippet",
    kind: "code",
    format: "typescript",
    source: "const x = 1",
    collapsed: false,
  })

  expect(result).toEqual({
    accepted: true,
    title: "Snippet",
    kind: "code",
    format: "typescript",
    source: "const x = 1",
    collapsed: false,
  })
})
```

Add a transcript hydration test in `src/client/lib/parseTranscript.test.ts`:

```ts
test("hydrates present_content tool results as structured data", () => {
  const messages = processTranscriptMessages([
    entry({
      kind: "tool_call",
      tool: {
        kind: "tool",
        toolKind: "present_content",
        toolName: "present_content",
        toolId: "tool-pc-1",
        input: {
          title: "Snippet",
          kind: "code",
          format: "typescript",
          source: "const x = 1",
        },
      },
    }),
    entry({
      kind: "tool_result",
      toolId: "tool-pc-1",
      content: {
        accepted: true,
        title: "Snippet",
        kind: "code",
        format: "typescript",
        source: "const x = 1",
      },
    }),
  ])

  expect(messages[0]?.kind).toBe("tool")
  if (messages[0]?.kind !== "tool") throw new Error("unexpected message")
  expect(messages[0].result).toEqual({
    accepted: true,
    title: "Snippet",
    kind: "code",
    format: "typescript",
    source: "const x = 1",
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/shared/tools.test.ts src/client/lib/parseTranscript.test.ts
```

Expected: FAIL because `present_content` is not part of the normalized tool union or hydration logic.

- [ ] **Step 3: Write the minimal implementation**

In `src/shared/types.ts`, add:

```ts
export interface PresentContentInput {
  title: string
  kind: "markdown" | "code" | "diagram"
  format: string
  source: string
  summary?: string
  collapsed?: boolean
}

export interface PresentContentToolCall
  extends ToolCallBase<"present_content", PresentContentInput> { }

export interface PresentContentToolResult {
  accepted: true
  title: string
  kind: "markdown" | "code" | "diagram"
  format: string
  source: string
  summary?: string
  collapsed?: boolean
}

export type HydratedPresentContentToolCall =
  HydratedToolCallBase<"present_content", PresentContentToolCall["input"], PresentContentToolResult>
```

Wire `PresentContentToolCall` and `HydratedPresentContentToolCall` into the `NormalizedToolCall` and `HydratedToolCall` unions.

In `src/shared/tools.ts`, add:

```ts
case "present_content":
  return {
    kind: "tool",
    toolKind: "present_content",
    toolName,
    toolId,
    input: {
      title: typeof input.title === "string" ? input.title : "",
      kind: input.kind === "markdown" || input.kind === "code" || input.kind === "diagram" ? input.kind : "markdown",
      format: typeof input.format === "string" ? input.format : "text",
      source: typeof input.source === "string" ? input.source : "",
      summary: typeof input.summary === "string" ? input.summary : undefined,
      collapsed: typeof input.collapsed === "boolean" ? input.collapsed : undefined,
    },
    rawInput: input,
  }
```

And in `hydrateToolResult`:

```ts
case "present_content": {
  const record = asRecord(parsed)
  return {
    accepted: true,
    title: typeof record?.title === "string" ? record.title : tool.input.title,
    kind: record?.kind === "markdown" || record?.kind === "code" || record?.kind === "diagram"
      ? record.kind
      : tool.input.kind,
    format: typeof record?.format === "string" ? record.format : tool.input.format,
    source: typeof record?.source === "string" ? record.source : tool.input.source,
    summary: typeof record?.summary === "string" ? record.summary : tool.input.summary,
    collapsed: typeof record?.collapsed === "boolean" ? record.collapsed : tool.input.collapsed,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test src/shared/tools.test.ts src/client/lib/parseTranscript.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/tools.ts src/shared/tools.test.ts src/client/lib/parseTranscript.test.ts
git commit -m "feat: add shared present_content tool types"
```

## Task 3: Handle `present_content` In The Codex App-Server Bridge

**Files:**
- Modify: `src/server/codex-app-server.ts`
- Modify: `src/server/codex-app-server.test.ts`

- [ ] **Step 1: Write the failing server behavior tests**

Add a success-path test in `src/server/codex-app-server.test.ts`:

```ts
test("records present_content dynamic tool calls as typed transcript entries", async () => {
  const process = new FakeCodexProcess((message, child) => {
    if (message.method === "initialize") {
      child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      return
    }
    if (message.method === "thread/start") {
      child.writeServerMessage({
        id: message.id,
        result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
      })
      return
    }
    if (message.method === "turn/start") {
      child.writeServerMessage({
        id: message.id,
        result: { turn: { id: "turn-1", status: "inProgress", error: null } },
      })
      child.writeServerMessage({
        id: "dyn-2",
        method: "item/tool/call",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          callId: "call-present-1",
          tool: "present_content",
          arguments: {
            title: "System Design",
            kind: "diagram",
            format: "mermaid",
            source: "graph TD\\nA-->B",
            summary: "Current state",
            collapsed: true,
          },
        },
      })
      child.writeServerMessage({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "completed", error: null },
        },
      })
    }
  })

  const manager = new CodexAppServerManager({
    spawnProcess: () => process as never,
  })

  await manager.startSession({
    chatId: "chat-1",
    cwd: "/tmp/project",
    model: "gpt-5.4",
    sessionToken: null,
  })

  const turn = await manager.startTurn({
    chatId: "chat-1",
    model: "gpt-5.4",
    content: "show me the system",
    planMode: false,
    onToolRequest: async () => ({}),
  })

  const events = await collectStream(turn.stream)
  const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
  const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")
  const response = process.messages.find((message: any) => message.id === "dyn-2")

  expect(toolCall?.entry.kind).toBe("tool_call")
  if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
  expect(toolCall.entry.tool.toolKind).toBe("present_content")
  expect(toolResult?.entry.kind).toBe("tool_result")
  expect(toolResult?.entry.content).toEqual({
    accepted: true,
    title: "System Design",
    kind: "diagram",
    format: "mermaid",
    source: "graph TD\\nA-->B",
    summary: "Current state",
    collapsed: true,
  })
  expect(response).toEqual({
    id: "dyn-2",
    result: {
      contentItems: [{ type: "inputText", text: "presented" }],
      success: true,
    },
  })
})
```

Add an invalid-payload regression test:

```ts
test("rejects invalid present_content payloads without crashing the turn", async () => {
  const process = new FakeCodexProcess((message, child) => {
    if (message.method === "initialize") {
      child.writeServerMessage({ id: message.id, result: { userAgent: "codex-test" } })
      return
    }
    if (message.method === "thread/start") {
      child.writeServerMessage({
        id: message.id,
        result: { thread: { id: "thread-1" }, model: "gpt-5.4", reasoningEffort: "high" },
      })
      return
    }
    if (message.method === "turn/start") {
      child.writeServerMessage({
        id: message.id,
        result: { turn: { id: "turn-1", status: "inProgress", error: null } },
      })
      child.writeServerMessage({
        id: "dyn-3",
        method: "item/tool/call",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          callId: "call-present-invalid-1",
          tool: "present_content",
          arguments: { title: 42 },
        },
      })
      child.writeServerMessage({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "completed", error: null },
        },
      })
    }
  })

  const manager = new CodexAppServerManager({
    spawnProcess: () => process as never,
  })

  await manager.startSession({
    chatId: "chat-1",
    cwd: "/tmp/project",
    model: "gpt-5.4",
    sessionToken: null,
  })

  const turn = await manager.startTurn({
    chatId: "chat-1",
    model: "gpt-5.4",
    content: "show invalid card",
    planMode: false,
    onToolRequest: async () => ({}),
  })

  const events = await collectStream(turn.stream)
  const toolCall = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_call")
  const toolResult = events.find((event) => event.type === "transcript" && event.entry.kind === "tool_result")
  const response = process.messages.find((message: any) => message.id === "dyn-3")

  expect(toolCall?.entry.kind).toBe("tool_call")
  if (!toolCall || toolCall.entry.kind !== "tool_call") throw new Error("missing tool call")
  expect(toolCall.entry.tool.toolKind).toBe("present_content")
  expect(toolResult?.entry.kind).toBe("tool_result")
  if (!toolResult || toolResult.entry.kind !== "tool_result") throw new Error("missing tool result")
  expect(toolResult.entry.isError).toBe(true)
  expect(toolResult.entry.content).toEqual({ error: "Invalid present_content payload" })
  expect(response).toEqual({
    id: "dyn-3",
    result: {
      contentItems: [{ type: "inputText", text: "Invalid present_content payload" }],
      success: false,
    },
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/server/codex-app-server.test.ts -t "present_content"
```

Expected: FAIL because `item/tool/call` only supports `update_plan` and treats everything else as unsupported.

- [ ] **Step 3: Write the minimal implementation**

In `src/server/codex-app-server.ts`:

1. Add a small normalizer:

```ts
function normalizePresentContentInput(input: Record<string, unknown>) {
  const kind = input.kind === "markdown" || input.kind === "code" || input.kind === "diagram"
    ? input.kind
    : null

  if (
    typeof input.title !== "string"
    || !kind
    || typeof input.format !== "string"
    || typeof input.source !== "string"
  ) {
    return null
  }

  return {
    title: input.title,
    kind,
    format: input.format,
    source: input.source,
    summary: typeof input.summary === "string" ? input.summary : undefined,
    collapsed: typeof input.collapsed === "boolean" ? input.collapsed : undefined,
  }
}
```

2. In `handleServerRequest()`, branch before the generic unsupported path:

```ts
if (request.params.tool === "present_content") {
  const payload = dynamicToolPayload(request.params.arguments)
  const normalized = normalizePresentContentInput(payload)

  pendingTurn.queue.push({
    type: "transcript",
    entry: timestamped({
      kind: "tool_call",
      tool: normalizeToolCall({
        toolName: "present_content",
        toolId: request.params.callId,
        input: payload,
      }),
    }),
  })

  if (!normalized) {
    pendingTurn.queue.push({
      type: "transcript",
      entry: timestamped({
        kind: "tool_result",
        toolId: request.params.callId,
        content: { error: "Invalid present_content payload" },
        isError: true,
      }),
    })
    this.writeMessage(context, {
      id: request.id,
      result: {
        contentItems: [{ type: "inputText", text: "Invalid present_content payload" }],
        success: false,
      } satisfies DynamicToolCallResponse,
    })
    return
  }

  pendingTurn.queue.push({
    type: "transcript",
    entry: timestamped({
      kind: "tool_result",
      toolId: request.params.callId,
      content: {
        accepted: true,
        ...normalized,
      },
    }),
  })

  this.writeMessage(context, {
    id: request.id,
    result: {
      contentItems: [{ type: "inputText", text: "presented" }],
      success: true,
    } satisfies DynamicToolCallResponse,
  })
  return
}
```

3. Keep the existing unsupported dynamic-tool path unchanged after this new branch.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test src/server/codex-app-server.test.ts -t "present_content"
bun test src/server/codex-app-server.test.ts -t "responds to unsupported dynamic tool requests with a generic tool error"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/codex-app-server.ts src/server/codex-app-server.test.ts
git commit -m "feat: handle codex present_content tool calls"
```

## Task 4: Add Transcript UI For `present_content`

**Files:**
- Create: `src/client/components/messages/PresentContentMessage.tsx`
- Create: `src/client/components/messages/PresentContentMessage.test.tsx`
- Create: `src/client/app/KannaTranscript.test.tsx`
- Modify: `src/client/app/KannaTranscript.tsx`
- Modify: `src/client/components/messages/types.ts`

- [ ] **Step 1: Write the failing UI tests**

Create `src/client/components/messages/PresentContentMessage.test.tsx` with:

```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { HydratedPresentContentToolCall } from "../../../shared/types"
import { PresentContentMessage } from "./PresentContentMessage"

function message(result: HydratedPresentContentToolCall["result"]): HydratedPresentContentToolCall {
  return {
    id: "tool-1",
    kind: "tool",
    toolKind: "present_content",
    toolName: "present_content",
    toolId: "tool-1",
    input: {
      title: "Artifact",
      kind: "markdown",
      format: "markdown",
      source: "# Title",
    },
    result,
    timestamp: new Date(0).toISOString(),
  }
}

describe("PresentContentMessage", () => {
  test("renders markdown artifacts through the markdown pipeline", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={message({
          accepted: true,
          title: "Artifact",
          kind: "markdown",
          format: "markdown",
          source: "# Title",
          summary: "Context",
        })}
      />
    )

    expect(html).toContain("Context")
    expect(html).toContain("group/rich-content")
    expect(html).toContain("<h1")
  })

  test("renders embed formats through the rich embed path", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={message({
          accepted: true,
          title: "Diagram",
          kind: "diagram",
          format: "mermaid",
          source: "graph TD\\nA-->B",
        })}
      />
    )

    expect(html).toContain("group/rich-content")
    expect(html).toContain("lucide-image")
  })

  test("renders code-like formats through the code rich-content path", () => {
    const html = renderToStaticMarkup(
      <PresentContentMessage
        message={message({
          accepted: true,
          title: "Code",
          kind: "code",
          format: "typescript",
          source: "const x = 1",
        })}
      />
    )

    expect(html).toContain("group/rich-content")
    expect(html).toContain("const x = 1")
  })
})
```

Create `src/client/app/KannaTranscript.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { HydratedTranscriptMessage } from "../../shared/types"
import { KannaTranscript } from "./KannaTranscript"

describe("KannaTranscript", () => {
  test("renders present_content tool messages through the dedicated transcript component", () => {
    const messages: HydratedTranscriptMessage[] = [
      {
        id: "tool-1",
        kind: "tool",
        toolKind: "present_content",
        toolName: "present_content",
        toolId: "tool-1",
        input: {
          title: "Artifact",
          kind: "markdown",
          format: "markdown",
          source: "# Title",
        },
        result: {
          accepted: true,
          title: "Artifact",
          kind: "markdown",
          format: "markdown",
          source: "# Title",
          summary: "Context",
        },
        timestamp: new Date(0).toISOString(),
      },
    ]

    const html = renderToStaticMarkup(
      <KannaTranscript
        messages={messages}
        scrollRef={{ current: null }}
        isLoading={false}
        latestToolIds={{ AskUserQuestion: null, ExitPlanMode: null, TodoWrite: null }}
        onOpenLocalLink={() => {}}
        onAskUserQuestionSubmit={() => {}}
        onExitPlanModeConfirm={() => {}}
      />
    )

    expect(html).toContain("Context")
    expect(html).toContain("group/rich-content")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/client/components/messages/PresentContentMessage.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `src/client/components/messages/PresentContentMessage.tsx`:

```tsx
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ProcessedToolCall } from "./types"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import { EmbedRenderer, isEmbedLanguage } from "../rich-content/EmbedRenderer"
import { createMarkdownComponents } from "./shared"

interface Props {
  message: Extract<ProcessedToolCall, { toolKind: "present_content" }>
}

export function PresentContentMessage({ message }: Props) {
  const result = message.result
  if (!result || message.isError) return null

  const format = result.format
  const source = result.source
  const title = result.title
  const defaultExpanded = result.collapsed !== true

  let body: React.ReactNode

  if (format === "markdown") {
    body = (
      <Markdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents()}>
        {source}
      </Markdown>
    )
  } else if (isEmbedLanguage(format)) {
    body = <EmbedRenderer format={format} source={source} />
  } else {
    body = (
      <div className="relative overflow-x-auto max-w-full min-w-0 no-code-highlight">
        <pre className="min-w-0 rounded-none py-2.5 px-3.5"><code className={`language-${format}`}>{source}</code></pre>
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      {result.summary ? <p className="text-sm text-muted-foreground">{result.summary}</p> : null}
      <RichContentBlock
        type={isEmbedLanguage(format) ? "embed" : format === "markdown" ? "markdown" : "code"}
        title={title}
        rawContent={source}
        defaultExpanded={defaultExpanded}
      >
        {body}
      </RichContentBlock>
    </div>
  )
}
```

Update `src/client/app/KannaTranscript.tsx`:

```tsx
if (message.toolKind === "present_content") {
  return <PresentContentMessage key={message.id} message={message} />
}
```

Update `src/client/components/messages/types.ts` to export the new hydrated tool type cleanly through `ProcessedToolCall` without changing the existing public aliases.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test src/client/components/messages/PresentContentMessage.test.tsx src/client/components/messages/shared.test.tsx src/client/lib/parseTranscript.test.ts src/client/app/KannaTranscript.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/messages/PresentContentMessage.tsx src/client/components/messages/PresentContentMessage.test.tsx src/client/app/KannaTranscript.tsx src/client/app/KannaTranscript.test.tsx src/client/components/messages/types.ts
git commit -m "feat: render present_content transcript messages"
```

## Task 5: Teach Codex When To Use `present_content`

**Files:**
- Modify: `src/server/agent.ts`
- Modify: `src/server/agent.test.ts`

- [ ] **Step 1: Write the failing prompt test**

Add to `src/server/agent.test.ts`:

```ts
test("includes present_content guidance in the codex web prompt", () => {
  const prompt = getWebContextPrompt("codex")
  expect(prompt).toContain("present_content")
  expect(prompt).toContain("structured content artifact")
  expect(prompt).toContain("fall back to rich markdown")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/server/agent.test.ts -t "includes present_content guidance in the codex web prompt"
```

Expected: FAIL because the current prompt only mentions generic rich content and plan mode.

- [ ] **Step 3: Write the minimal implementation**

Update `getWebContextPrompt()` in `src/server/agent.ts` so the Codex branch adds lines like:

```ts
provider === "codex"
  ? [
      "Kanna also exposes a dynamic tool named present_content for deliberate structured transcript artifacts.",
      "Use present_content sparingly when you want to present a bounded artifact such as a diagram, code sample, or formatted note card.",
      "If present_content is unavailable or not appropriate, fall back to rich markdown in normal assistant text.",
    ]
  : []
```

Keep the shared prompt lines unchanged for Claude.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test src/server/agent.test.ts -t "includes present_content guidance in the codex web prompt"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/agent.ts src/server/agent.test.ts
git commit -m "feat: prompt codex to use present_content"
```

## Task 6: Full Verification, No-Slop Pass, Simplify Pass, Review Pass

**Files:**
- Verify only: `src/server/codex-app-server-protocol.ts`
- Verify only: `src/server/codex-app-server.ts`
- Verify only: `src/server/agent.ts`
- Verify only: `src/shared/types.ts`
- Verify only: `src/shared/tools.ts`
- Verify only: `src/client/app/KannaTranscript.tsx`
- Verify only: `src/client/components/messages/PresentContentMessage.tsx`

- [ ] **Step 1: Run the focused test suite**

Run:

```bash
bun test src/server/codex-app-server.test.ts src/server/agent.test.ts src/shared/tools.test.ts src/client/lib/parseTranscript.test.ts src/client/components/messages/shared.test.tsx src/client/components/messages/PresentContentMessage.test.tsx src/client/app/KannaTranscript.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the build**

Run:

```bash
bun run build
```

Expected: PASS

- [ ] **Step 3: Run C3 validation**

Run:

```bash
C3X_MODE=agent bash /home/lagz0ne/.agents/skills/c3/bin/c3x.sh check
```

Expected: zero issues

- [ ] **Step 4: Run native TypeScript check if viable**

Run:

```bash
bunx @typescript/native-preview --noEmit -p tsconfig.json
```

Expected: PASS, or if the pre-existing `tsconfig.json` `baseUrl` incompatibility still blocks the repo, record that explicitly and do not claim this step as newly broken by the feature.

- [ ] **Step 5: Do the no-slop, simplify, and review passes**

Checklist:

```text
No-slop pass:
- remove duplicated normalization logic if a small helper can serve both call handling and tests
- remove any unused prop/type branches introduced during implementation

Simplify pass:
- keep only one typed dynamic-tool path for present_content
- avoid introducing a generic dynamic tool framework prematurely

Review pass:
- make sure invalid payloads fail deterministically
- make sure unsupported dynamic tools still use the generic error path
- make sure transcript rendering reuses existing rich-content primitives rather than forking styling
```

- [ ] **Step 6: Final commit**

```bash
git add src/server/codex-app-server-protocol.ts src/server/codex-app-server.ts src/server/agent.ts src/shared/types.ts src/shared/tools.ts src/client/app/KannaTranscript.tsx src/client/app/KannaTranscript.test.tsx src/client/components/messages/types.ts src/client/components/messages/PresentContentMessage.tsx src/server/codex-app-server.test.ts src/server/agent.test.ts src/shared/tools.test.ts src/client/lib/parseTranscript.test.ts src/client/components/messages/PresentContentMessage.test.tsx
git commit -m "feat: add codex present_content transcript cards"
```
