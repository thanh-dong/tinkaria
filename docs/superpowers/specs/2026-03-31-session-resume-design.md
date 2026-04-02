# Session Resume

Resume previous Claude/Codex sessions from within Kanna — both Kanna-created and CLI-originated.

## Sources

Two session sources, merged into a unified list per project:

| Source | Location | Session ID | Has title? |
|--------|----------|------------|------------|
| **Kanna** | EventStore `chatsById` where `sessionToken` is set | `chat.sessionToken` | Yes (chat title) |
| **Claude CLI** | `~/.claude/projects/<encoded-path>/*.jsonl` | filename UUID | No — derive from content |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` filtered by `cwd === projectPath` | `session_meta.payload.id` | No — derive from content |

Dedup: if a CLI session's `sessionId` matches a Kanna chat's `sessionToken`, keep the Kanna version (richer metadata).

## Data Model

```typescript
// src/shared/types.ts

interface DiscoveredSession {
  sessionId: string
  provider: AgentProvider
  source: "kanna" | "cli"
  title: string
  lastExchange: { question: string; answer: string } | null
  modifiedAt: number
  kannaChatId: string | null
}

interface SessionsSnapshot {
  projectId: string
  projectPath: string
  sessions: DiscoveredSession[]
}
```

**Title resolution** (first non-empty wins):
1. Kanna chat title (if source is `"kanna"` and title !== `"New Chat"`)
2. `lastExchange.question` truncated to 80 chars
3. Formatted date: `"Mar 31, 2:30 PM"`

Source differentiation (kanna vs cli) via visual indicator (icon), not text prefix.

## Session Discovery

New module: `src/server/session-discovery.ts`

### Claude Sessions

Reuses `resolveEncodedClaudePath()` from `discovery.ts` (imported, not reimplemented).

```
resolveEncodedClaudePath(projectPath) → ~/.claude/projects/<encoded>/
scan *.jsonl files only (skip directories — same UUID dirs contain subagents/tool-results)
for each:
  - sessionId = filename (UUID, strip .jsonl)
  - stat() → modifiedAt
  - read first 5 lines → find first {type:"user"} message → title candidate
  - read last 32KB → parse backward for last user + assistant messages → lastExchange
```

### Codex Sessions

Reuses scanning logic from `CodexProjectDiscoveryAdapter` in `discovery.ts` (`collectCodexSessionFiles`, `readCodexSessionMetadata`).

```
scan ~/.codex/sessions/ recursively for *.jsonl
for each:
  - parse first line → require {type:"session_meta"}
  - extract payload.id (sessionId), payload.cwd
  - filter: cwd === projectPath
  - stat() → modifiedAt
  - read last 32KB → parse backward for last user + assistant → lastExchange
```

### Merge

```typescript
function discoverSessions(
  projectId: string,
  projectPath: string,
  store: EventStore
): SessionsSnapshot
```

1. Scan Claude CLI sessions for `projectPath`
2. Scan Codex CLI sessions filtered by `cwd`
3. Collect Kanna chats for `projectId` that have `sessionToken`
4. Dedup: Kanna wins over CLI by `sessionId`
5. Sort by `modifiedAt` desc
6. Return `SessionsSnapshot`

## NATS Integration

### Subscription Topic

```typescript
// protocol.ts — SubscriptionTopic union adds:
| { type: "sessions"; projectId: string }

// nats-subjects.ts
case "sessions": return `sessions.${topic.projectId}`
```

### Lifecycle

| Trigger | Action |
|---------|--------|
| Client subscribes (picker opens) | Scan disk + merge EventStore → publish to KV |
| 60s poll (while subscribed) | Re-scan → dedup skips if JSON unchanged |
| Manual refresh command | Immediate re-scan + re-publish |
| Kanna chat create/delete | `broadcastSnapshots()` → sessions topic re-computed |
| Client unsubscribes (picker closes) | Dedup cache prunes; KV entry stale but harmless |

### Refresh Command

```typescript
// protocol.ts — ClientCommand union adds:
| { type: "sessions.refresh"; projectId: string }
```

Non-mutating command. Triggers `discoverSessions()` + re-publishes the sessions snapshot for the project.

### Poll Timer

Server-side: when a `sessions` subscription is added and none existed before for that `projectId`, start a 60s `setInterval`. On last unsubscribe for that `projectId`, clear the interval.

## Session Picker UI

New component: `src/client/components/chat-ui/SessionPicker.tsx`

**Two-button model**: existing `SquarePen` "+" stays for instant new chat. New `History` icon button added **left** of "+" to open the session picker popover.

### Trigger

- `History` icon (lucide) — `size-3.5`, `variant="ghost"`, `size="icon"`
- Layout on project group header: `[🕐 +]` — history left, new chat right
- Click opens Radix Popover

### Container: Radix Popover

Anchored to the `History` button. Reuses existing Radix Popover primitive (`@radix-ui/react-popover`).

- **Width**: `w-72` (288px) — matches existing popover pattern
- **Max height**: `max-h-[400px]` with internal scroll
- **Position**: `side="right"` with `sideOffset={8}` — opens beside the sidebar
- **Styling**: `rounded-xl border-border bg-background shadow-lg` — consistent with existing popovers

### Layout (top → bottom)

1. **Search row** — `<input>` with `Search` icon (lucide) + `RefreshCw` button (triggers `sessions.refresh`)
2. **Session list** — scrollable `max-h-[300px]`
3. **"Show more" button** — loads next 7-day window

**Search scope**: matches against session title AND `lastExchange.question` text.

### Session List Rules

- **Default view**: sessions from last 7 days, capped at 25 items
- **"Show more"**: loads next 7-day window (+7 days each click: 7-14d, 14-21d, etc.)
- **Search**: searches ALL discovered sessions regardless of time window
- **Sort**: `modifiedAt` desc within each window

Each session row:
- **Source icon**: `Flower` (Kanna sessions) / `Terminal` (CLI sessions) — `size-3.5 text-muted-foreground`
- **Title** (per resolution chain) — `text-sm truncate`
- **Unnamed sessions**: `lastExchange.question` in `text-muted-foreground italic`
- **Provider badge**: Subtle `text-[10px]` pill — "Claude" / "Codex"
- **Relative timestamp**: `text-xs text-muted-foreground` right-aligned
- **Hover**: `bg-muted/50` with `transition-colors`
- **Active/selected**: `bg-muted border-l-2 border-logo`

### Click Behavior

| Session type | Action |
|---|---|
| Kanna session (`kannaChatId` set) | Close popover → navigate to `/chat/<kannaChatId>` |
| CLI session (`kannaChatId` null) | Send `sessions.resume` → creates Kanna chat with sessionToken → close popover → navigate to new `/chat/<chatId>` |

### Keyboard

- `Escape` closes popover (Radix default)
- Arrow keys navigate session list
- `Enter` selects focused session
- Search input auto-focused on open

## Transcript Import (CLI → Kanna)

When resuming a CLI session for the first time, the user sees an empty chat. To provide context:

1. **On resume**: Import first 50 messages from CLI transcript into Kanna's EventStore
2. **Display**: 50 messages rendered immediately; older messages lazy-loaded on scroll-up using existing `chat.getMessages({ offset, limit })` pagination
3. **Source**: Parse CLI `.jsonl` file — extract `{type:"user"}` and `{type:"assistant"}` entries as `TranscriptEntry` events
4. **Idempotent**: Skip if chat already has messages (re-resume scenario)

## Resume Command

```typescript
// protocol.ts — ClientCommand union adds:
| { type: "sessions.resume"; projectId: string; sessionId: string; provider: AgentProvider }
```

Server handler:
1. `store.createChat(projectId)` → new chatId
2. `store.setSessionToken(chatId, sessionId)`
3. `store.setChatProvider(chatId, provider)`
4. Return `{ chatId }`

Then user sends first message → `AgentCoordinator.send()` → provider-specific resume:

| Provider | Resume mechanism | Fallback |
|----------|-----------------|----------|
| **Claude** | `query({ options: { resume: sessionToken } })` — agent.ts:~306 | Creates new session if token invalid |
| **Codex** | `thread/resume` JSON-RPC (codex-app-server.ts:698-721) with `threadId` | `isRecoverableResumeError()` → falls back to `thread/start` |

Both providers already support resume — no new provider-side work needed.

## Component Topology (C3)

| Entity | Type | Changes |
|--------|------|---------|
| `c3-213` discovery | component | Reference only — session-discovery is a sibling, not a change |
| **NEW** session-discovery | component | `src/server/session-discovery.ts` — under server container c3-2 |
| `c3-205` nats-transport | component | New subscription topic + poll timer |
| `c3-214` read-models | component | New `deriveSessionsSnapshot()` |
| `c3-110` chat | component | Wire SessionPicker into sidebar's "+" button |
| `c3-113` sidebar | component | SessionPicker replaces onCreateChat handler |
| `c3-204` shared-types | component | New types: `DiscoveredSession`, `SessionsSnapshot` |

## Test Plan (RED-GREEN-TDD)

| Module | Test file | Coverage |
|--------|-----------|----------|
| `session-discovery.ts` | `session-discovery.test.ts` | Scan mock dirs with fake .jsonl; title resolution chain; last exchange extraction; dedup with EventStore; empty project |
| `read-models.ts` | `read-models.test.ts` | `deriveSessionsSnapshot()` merges correctly; sorting; dedup |
| `nats-publisher.ts` | Extend existing tests | Sessions topic computes + publishes; refresh triggers re-scan |
| `nats-responders.ts` | Extend existing tests | `sessions.resume` creates chat with sessionToken; `sessions.refresh` non-mutating |
| `SessionPicker.tsx` | `SessionPicker.test.tsx` | Renders sessions; search filters; click dispatches correct command; refresh button triggers command |

## Architecture Diagram

https://diashort.apps.quickable.co/d/2986ba43

## File Inventory

### New files
- `src/server/session-discovery.ts` — session scanning + metadata extraction
- `src/server/session-discovery.test.ts`
- `src/client/components/chat-ui/SessionPicker.tsx`
- `src/client/components/chat-ui/SessionPicker.test.tsx`

### Modified files
- `src/shared/types.ts` — add `DiscoveredSession`, `SessionsSnapshot`
- `src/shared/protocol.ts` — add `sessions` subscription topic, `sessions.resume`, `sessions.refresh` commands
- `src/shared/nats-subjects.ts` — add `sessions.<projectId>` KV key
- `src/server/nats-publisher.ts` — handle sessions topic + poll timer
- `src/server/nats-responders.ts` — handle `sessions.resume` + `sessions.refresh`
- `src/server/read-models.ts` — add `deriveSessionsSnapshot()`
- `src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx` — wire SessionPicker to "+" button
- `src/client/app/useKannaState.ts` — subscribe/unsubscribe to sessions topic
