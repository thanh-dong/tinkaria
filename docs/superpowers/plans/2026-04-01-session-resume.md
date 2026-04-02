# Session Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to browse and resume previous Claude/Codex sessions (both Kanna-created and CLI-originated) from a popover session picker in the sidebar.

**Architecture:** New `session-discovery` module scans `~/.claude/projects/` and `~/.codex/sessions/` for `.jsonl` files, merges with Kanna EventStore chats, and publishes via NATS subscription topic. Radix Popover UI with search, 7-day windowed list, and keyboard navigation. Resume creates a Kanna chat with imported transcript.

**Tech Stack:** Bun, TypeScript, React 19, Radix UI Popover, NATS JetStream KV, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-31-session-resume-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/server/session-discovery.ts` | Scan CLI session dirs, extract metadata, merge with EventStore, dedup |
| `src/server/session-discovery.test.ts` | Unit tests for scanning, parsing, title resolution, dedup |
| `src/client/components/chat-ui/SessionPicker.tsx` | Popover UI: search, session list, keyboard nav, click handlers |
| `src/client/components/chat-ui/SessionPicker.test.tsx` | SSR render tests for the picker component |

### Modified Files
| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `DiscoveredSession`, `SessionsSnapshot` interfaces |
| `src/shared/protocol.ts` | Add `sessions` topic to `SubscriptionTopic`, add `sessions.resume` + `sessions.refresh` to `ClientCommand` |
| `src/shared/nats-subjects.ts` | Add `sessions` case to `snapshotKvKey` |
| `src/server/read-models.ts` | Add `deriveSessionsSnapshot()` |
| `src/server/nats-publisher.ts` | Add `sessions` case to `computeSnapshot`, add poll timer lifecycle |
| `src/server/nats-responders.ts` | Add `sessions.resume` + `sessions.refresh` command handlers |
| `src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx` | Add `History` icon button left of `SquarePen`, render `SessionPicker` popover |
| `src/client/app/useKannaState.ts` | Add sessions subscription, expose sessions state + handlers |

---

## Task 1: Shared Types

**Files:**
- Modify: `src/shared/types.ts` (append after `SessionsSnapshot` area, around line 190)

- [ ] **Step 1: Add DiscoveredSession and SessionsSnapshot types**

In `src/shared/types.ts`, add after the `SidebarData` type (around line 190):

```typescript
export interface DiscoveredSession {
  sessionId: string
  provider: AgentProvider
  source: "kanna" | "cli"
  title: string
  lastExchange: { question: string; answer: string } | null
  modifiedAt: number
  kannaChatId: string | null
}

export interface SessionsSnapshot {
  projectId: string
  projectPath: string
  sessions: DiscoveredSession[]
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add DiscoveredSession and SessionsSnapshot types"
```

---

## Task 2: Protocol & NATS Subjects

**Files:**
- Modify: `src/shared/protocol.ts` (lines 14-20 for SubscriptionTopic, lines 40-79 for ClientCommand)
- Modify: `src/shared/nats-subjects.ts` (lines 7-12 for snapshotKvKey)

- [ ] **Step 1: Add sessions subscription topic to protocol.ts**

In `src/shared/protocol.ts`, add to the `SubscriptionTopic` union (after the `terminal` line, around line 20):

```typescript
| { type: "sessions"; projectId: string }
```

- [ ] **Step 2: Add sessions commands to ClientCommand union**

In `src/shared/protocol.ts`, add to the `ClientCommand` union (after the last chat command, around line 75):

```typescript
| { type: "sessions.resume"; projectId: string; sessionId: string; provider: AgentProvider }
| { type: "sessions.refresh"; projectId: string }
```

- [ ] **Step 3: Add sessions case to snapshotKvKey**

In `src/shared/nats-subjects.ts`, add a case to `snapshotKvKey` before the `default` (around line 10):

```typescript
case "sessions":
  return `sessions.${topic.projectId}`
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: Errors in `nats-publisher.ts` and `nats-responders.ts` (exhaustive switch). This is expected — we'll fix those in later tasks.

- [ ] **Step 5: Commit**

```bash
git add src/shared/protocol.ts src/shared/nats-subjects.ts
git commit -m "feat(protocol): add sessions subscription topic and resume/refresh commands"
```

---

## Task 3: Session Discovery — Claude Scanner

**Files:**
- Create: `src/server/session-discovery.ts`
- Create: `src/server/session-discovery.test.ts`

- [ ] **Step 1: Write failing test for Claude session scanning**

Create `src/server/session-discovery.test.ts`:

```typescript
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scanClaudeSessions } from "./session-discovery"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function makeTempDir(prefix = "kanna-session-discovery-") {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe("scanClaudeSessions", () => {
  test("discovers .jsonl files and extracts metadata", async () => {
    const claudeDir = await makeTempDir()
    const sessionId = "abc12345-6789-0def-ghij-klmnopqrstuv"
    const sessionFile = join(claudeDir, `${sessionId}.jsonl`)

    const lines = [
      JSON.stringify({ type: "summary", summary: "" }),
      JSON.stringify({ type: "user", message: { content: "Fix the auth bug in login.ts" } }),
      JSON.stringify({ type: "assistant", message: { content: "I'll fix the auth bug." } }),
      JSON.stringify({ type: "user", message: { content: "Now add tests" } }),
      JSON.stringify({ type: "assistant", message: { content: "Here are the tests." } }),
    ]
    await writeFile(sessionFile, lines.join("\n") + "\n")
    const now = new Date()
    await utimes(sessionFile, now, now)

    const sessions = await scanClaudeSessions(claudeDir)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe(sessionId)
    expect(sessions[0].provider).toBe("claude")
    expect(sessions[0].source).toBe("cli")
    expect(sessions[0].lastExchange).not.toBeNull()
    expect(sessions[0].lastExchange!.question).toContain("add tests")
    expect(sessions[0].lastExchange!.answer).toContain("tests")
    expect(sessions[0].kannaChatId).toBeNull()
  })

  test("skips directories with same UUID names", async () => {
    const claudeDir = await makeTempDir()
    const sessionId = "abc12345-6789-0def-ghij-klmnopqrstuv"

    // Create both a .jsonl file and a directory with same UUID
    await writeFile(
      join(claudeDir, `${sessionId}.jsonl`),
      JSON.stringify({ type: "user", message: { content: "hello" } }) + "\n"
    )
    await mkdir(join(claudeDir, sessionId, "subagents"), { recursive: true })

    const sessions = await scanClaudeSessions(claudeDir)
    expect(sessions).toHaveLength(1)
  })

  test("returns empty array for nonexistent directory", async () => {
    const sessions = await scanClaudeSessions("/nonexistent/path")
    expect(sessions).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/session-discovery.test.ts`
Expected: FAIL — module `./session-discovery` not found

- [ ] **Step 3: Write scanClaudeSessions implementation**

Create `src/server/session-discovery.ts`:

```typescript
import { readdir, stat, open } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import type { AgentProvider, DiscoveredSession } from "../shared/types"

const TAIL_BYTES = 32 * 1024
const TITLE_SCAN_LINES = 5

interface LastExchange {
  question: string
  answer: string
}

function extractLastExchange(tailContent: string): LastExchange | null {
  const lines = tailContent.split("\n").filter(Boolean)
  let lastUser: string | null = null
  let lastAssistant: string | null = null

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed.type === "user" && parsed.message?.content) {
        lastUser = String(parsed.message.content).slice(0, 200)
      } else if (parsed.type === "assistant" && parsed.message?.content) {
        lastAssistant = String(parsed.message.content).slice(0, 200)
      }
    } catch {
      // skip malformed lines
    }
  }

  if (lastUser) {
    return { question: lastUser, answer: lastAssistant ?? "" }
  }
  return null
}

function extractTitleCandidate(headLines: string[]): string | null {
  for (const line of headLines.slice(0, TITLE_SCAN_LINES)) {
    try {
      const parsed = JSON.parse(line)
      if (parsed.type === "user" && parsed.message?.content) {
        return String(parsed.message.content).slice(0, 80)
      }
    } catch {
      // skip malformed lines
    }
  }
  return null
}

async function readTail(filePath: string, bytes: number): Promise<string> {
  const fh = await open(filePath, "r")
  try {
    const fileStat = await fh.stat()
    const size = fileStat.size
    const readStart = Math.max(0, size - bytes)
    const readLength = Math.min(bytes, size)
    const buffer = Buffer.alloc(readLength)
    await fh.read(buffer, 0, readLength, readStart)
    return buffer.toString("utf-8")
  } finally {
    await fh.close()
  }
}

async function readHead(filePath: string, lineCount: number): Promise<string[]> {
  const fh = await open(filePath, "r")
  try {
    // Read first 4KB for head lines
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await fh.read(buffer, 0, 4096, 0)
    const content = buffer.subarray(0, bytesRead).toString("utf-8")
    return content.split("\n").slice(0, lineCount)
  } finally {
    await fh.close()
  }
}

export async function scanClaudeSessions(
  claudeProjectDir: string
): Promise<DiscoveredSession[]> {
  let entries: string[]
  try {
    entries = await readdir(claudeProjectDir)
  } catch {
    return []
  }

  const sessions: DiscoveredSession[] = []

  for (const entry of entries) {
    if (extname(entry) !== ".jsonl") continue
    const filePath = join(claudeProjectDir, entry)
    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) continue

    const sessionId = basename(entry, ".jsonl")
    const modifiedAt = fileStat.mtimeMs

    const [headLines, tailContent] = await Promise.all([
      readHead(filePath, TITLE_SCAN_LINES),
      readTail(filePath, TAIL_BYTES),
    ])

    const titleCandidate = extractTitleCandidate(headLines)
    const lastExchange = extractLastExchange(tailContent)

    sessions.push({
      sessionId,
      provider: "claude" as AgentProvider,
      source: "cli",
      title: titleCandidate ?? formatDateTitle(modifiedAt),
      lastExchange,
      modifiedAt,
      kannaChatId: null,
    })
  }

  return sessions
}

export function formatDateTitle(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/session-discovery.ts src/server/session-discovery.test.ts
git commit -m "feat(session-discovery): Claude CLI session scanner with metadata extraction"
```

---

## Task 4: Session Discovery — Codex Scanner

**Files:**
- Modify: `src/server/session-discovery.ts` (add `scanCodexSessions`)
- Modify: `src/server/session-discovery.test.ts` (add Codex tests)

- [ ] **Step 1: Write failing test for Codex session scanning**

Append to `src/server/session-discovery.test.ts`:

```typescript
import { scanCodexSessions } from "./session-discovery"

describe("scanCodexSessions", () => {
  test("discovers sessions filtered by project path", async () => {
    const sessionsDir = await makeTempDir()
    const dateDir = join(sessionsDir, "2026", "03", "31")
    await mkdir(dateDir, { recursive: true })

    const projectPath = "/home/user/dev/kanna"

    // Matching session
    const matchFile = join(dateDir, "session-match.jsonl")
    const matchLines = [
      JSON.stringify({ type: "session_meta", payload: { id: "sess-1", cwd: projectPath, timestamp: Date.now() } }),
      JSON.stringify({ type: "user", message: { content: "Fix the tests" } }),
      JSON.stringify({ type: "assistant", message: { content: "Done." } }),
    ]
    await writeFile(matchFile, matchLines.join("\n") + "\n")

    // Non-matching session (different cwd)
    const noMatchFile = join(dateDir, "session-nomatch.jsonl")
    const noMatchLines = [
      JSON.stringify({ type: "session_meta", payload: { id: "sess-2", cwd: "/other/project", timestamp: Date.now() } }),
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
    ]
    await writeFile(noMatchFile, noMatchLines.join("\n") + "\n")

    const sessions = await scanCodexSessions(sessionsDir, projectPath)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe("sess-1")
    expect(sessions[0].provider).toBe("codex")
    expect(sessions[0].source).toBe("cli")
    expect(sessions[0].lastExchange!.question).toContain("Fix the tests")
  })

  test("returns empty array for nonexistent directory", async () => {
    const sessions = await scanCodexSessions("/nonexistent/path", "/some/path")
    expect(sessions).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/session-discovery.test.ts`
Expected: FAIL — `scanCodexSessions` not found in exports

- [ ] **Step 3: Implement scanCodexSessions**

Add to `src/server/session-discovery.ts`:

```typescript
async function collectJsonlFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  let dirEntries: import("node:fs").Dirent[]
  try {
    dirEntries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of dirEntries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await collectJsonlFiles(fullPath)))
    } else if (entry.isFile() && extname(entry.name) === ".jsonl") {
      result.push(fullPath)
    }
  }
  return result
}

export async function scanCodexSessions(
  codexSessionsDir: string,
  projectPath: string
): Promise<DiscoveredSession[]> {
  const files = await collectJsonlFiles(codexSessionsDir)
  const sessions: DiscoveredSession[] = []

  for (const filePath of files) {
    const headLines = await readHead(filePath, 1)
    if (headLines.length === 0) continue

    let meta: { id: string; cwd: string; timestamp?: number }
    try {
      const parsed = JSON.parse(headLines[0])
      if (parsed.type !== "session_meta" || !parsed.payload?.id || !parsed.payload?.cwd) continue
      meta = parsed.payload
    } catch {
      continue
    }

    if (meta.cwd !== projectPath) continue

    const fileStat = await stat(filePath).catch(() => null)
    if (!fileStat) continue

    const modifiedAt = meta.timestamp ?? fileStat.mtimeMs
    const tailContent = await readTail(filePath, TAIL_BYTES)
    const lastExchange = extractLastExchange(tailContent)

    const titleLines = await readHead(filePath, TITLE_SCAN_LINES + 1) // +1 to skip session_meta
    const titleCandidate = extractTitleCandidate(titleLines.slice(1)) // skip first line (session_meta)

    sessions.push({
      sessionId: meta.id,
      provider: "codex" as AgentProvider,
      source: "cli",
      title: titleCandidate ?? formatDateTitle(modifiedAt),
      lastExchange,
      modifiedAt,
      kannaChatId: null,
    })
  }

  return sessions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/session-discovery.ts src/server/session-discovery.test.ts
git commit -m "feat(session-discovery): Codex CLI session scanner with cwd filtering"
```

---

## Task 5: Session Discovery — Title Resolution & Merge

**Files:**
- Modify: `src/server/session-discovery.ts` (add `discoverSessions`)
- Modify: `src/server/session-discovery.test.ts` (add merge/dedup tests)

- [ ] **Step 1: Write failing test for title resolution**

Append to `src/server/session-discovery.test.ts`:

```typescript
import { resolveTitle, formatDateTitle } from "./session-discovery"

describe("resolveTitle", () => {
  test("uses kanna title when source is kanna and title is not default", () => {
    expect(resolveTitle("Fix the bug", "kanna", null, 1000)).toBe("Fix the bug")
  })

  test("falls through 'New Chat' title to lastExchange", () => {
    expect(
      resolveTitle("New Chat", "kanna", { question: "Why is auth broken?", answer: "Because..." }, 1000)
    ).toBe("Why is auth broken?")
  })

  test("truncates lastExchange.question to 80 chars", () => {
    const longQuestion = "a".repeat(100)
    expect(
      resolveTitle("New Chat", "kanna", { question: longQuestion, answer: "" }, 1000)
    ).toHaveLength(80)
  })

  test("falls back to formatted date when no title or exchange", () => {
    const result = resolveTitle("New Chat", "kanna", null, 1711900200000)
    expect(result).toContain("Mar")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/session-discovery.test.ts`
Expected: FAIL — `resolveTitle` not exported

- [ ] **Step 3: Implement resolveTitle**

Add to `src/server/session-discovery.ts`:

```typescript
export function resolveTitle(
  rawTitle: string,
  source: "kanna" | "cli",
  lastExchange: LastExchange | null,
  modifiedAt: number
): string {
  // 1. Kanna chat title if meaningful
  if (source === "kanna" && rawTitle !== "New Chat" && rawTitle.trim() !== "") {
    return rawTitle
  }

  // 2. Last exchange question truncated to 80 chars
  if (lastExchange?.question) {
    return lastExchange.question.slice(0, 80)
  }

  // 3. Formatted date
  return formatDateTitle(modifiedAt)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for discoverSessions merge/dedup**

Append to `src/server/session-discovery.test.ts`:

```typescript
import { mergeSessions } from "./session-discovery"
import type { DiscoveredSession } from "../shared/types"

describe("mergeSessions", () => {
  test("deduplicates CLI sessions when Kanna has matching sessionToken", () => {
    const cliSessions: DiscoveredSession[] = [
      {
        sessionId: "shared-id",
        provider: "claude",
        source: "cli",
        title: "CLI title",
        lastExchange: { question: "q", answer: "a" },
        modifiedAt: 1000,
        kannaChatId: null,
      },
    ]
    const kannaSessions: DiscoveredSession[] = [
      {
        sessionId: "shared-id",
        provider: "claude",
        source: "kanna",
        title: "Kanna title",
        lastExchange: { question: "q", answer: "a" },
        modifiedAt: 2000,
        kannaChatId: "chat-123",
      },
    ]

    const merged = mergeSessions(cliSessions, kannaSessions)

    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe("kanna")
    expect(merged[0].kannaChatId).toBe("chat-123")
  })

  test("sorts by modifiedAt descending", () => {
    const sessions: DiscoveredSession[] = [
      { sessionId: "old", provider: "claude", source: "cli", title: "old", lastExchange: null, modifiedAt: 1000, kannaChatId: null },
      { sessionId: "new", provider: "claude", source: "cli", title: "new", lastExchange: null, modifiedAt: 3000, kannaChatId: null },
      { sessionId: "mid", provider: "claude", source: "cli", title: "mid", lastExchange: null, modifiedAt: 2000, kannaChatId: null },
    ]

    const merged = mergeSessions(sessions, [])
    expect(merged.map((s) => s.sessionId)).toEqual(["new", "mid", "old"])
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test src/server/session-discovery.test.ts`
Expected: FAIL — `mergeSessions` not exported

- [ ] **Step 7: Implement mergeSessions**

Add to `src/server/session-discovery.ts`:

```typescript
export function mergeSessions(
  cliSessions: DiscoveredSession[],
  kannaSessions: DiscoveredSession[]
): DiscoveredSession[] {
  const bySessionId = new Map<string, DiscoveredSession>()

  // CLI sessions first
  for (const session of cliSessions) {
    bySessionId.set(session.sessionId, session)
  }

  // Kanna sessions overwrite CLI (richer metadata)
  for (const session of kannaSessions) {
    bySessionId.set(session.sessionId, session)
  }

  return [...bySessionId.values()].sort((a, b) => b.modifiedAt - a.modifiedAt)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add src/server/session-discovery.ts src/server/session-discovery.test.ts
git commit -m "feat(session-discovery): title resolution and merge/dedup logic"
```

---

## Task 6: Session Discovery — Full discoverSessions Orchestrator

**Files:**
- Modify: `src/server/session-discovery.ts` (add `discoverSessions` — the main entry point)
- Modify: `src/server/session-discovery.test.ts` (integration test)

- [ ] **Step 1: Write failing test for discoverSessions**

Append to `src/server/session-discovery.test.ts`:

```typescript
import { discoverSessions } from "./session-discovery"
import { EventStore } from "./event-store"

describe("discoverSessions", () => {
  test("merges Claude CLI + EventStore chats for a project", async () => {
    const tempDir = await makeTempDir()
    const store = new EventStore(tempDir)
    await store.initialize()

    // Create a Kanna chat with sessionToken
    const project = store.openProject("/home/user/dev/kanna", "kanna")
    const chat = store.createChat(project.id)
    store.setSessionToken(chat.id, "kanna-session-token")
    store.setChatProvider(chat.id, "claude")

    // Create a mock Claude projects dir
    const claudeDir = join(tempDir, "claude-projects")
    await mkdir(claudeDir, { recursive: true })

    // A CLI-only session
    await writeFile(
      join(claudeDir, "cli-only-session.jsonl"),
      JSON.stringify({ type: "user", message: { content: "Hello CLI" } }) + "\n"
    )

    const snapshot = await discoverSessions({
      projectId: project.id,
      projectPath: "/home/user/dev/kanna",
      store,
      claudeProjectDir: claudeDir,
      codexSessionsDir: "/nonexistent",
    })

    expect(snapshot.projectId).toBe(project.id)
    expect(snapshot.sessions.length).toBeGreaterThanOrEqual(2) // 1 kanna + 1 cli
    // Kanna session should be present
    expect(snapshot.sessions.some((s) => s.source === "kanna")).toBe(true)
    // CLI session should be present
    expect(snapshot.sessions.some((s) => s.source === "cli")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/session-discovery.test.ts`
Expected: FAIL — `discoverSessions` not exported

- [ ] **Step 3: Implement discoverSessions**

Add to `src/server/session-discovery.ts`:

```typescript
import type { SessionsSnapshot } from "../shared/types"
import type { EventStore } from "./event-store"

interface DiscoverSessionsOptions {
  projectId: string
  projectPath: string
  store: EventStore
  claudeProjectDir: string | null
  codexSessionsDir: string | null
}

export async function discoverSessions(
  options: DiscoverSessionsOptions
): Promise<SessionsSnapshot> {
  const { projectId, projectPath, store, claudeProjectDir, codexSessionsDir } = options

  // 1. Scan CLI sessions in parallel
  const [claudeCliSessions, codexCliSessions] = await Promise.all([
    claudeProjectDir ? scanClaudeSessions(claudeProjectDir) : Promise.resolve([]),
    codexSessionsDir ? scanCodexSessions(codexSessionsDir, projectPath) : Promise.resolve([]),
  ])

  // 2. Collect Kanna chats with sessionToken
  const kannaChats = store.listChatsByProject(projectId)
  const kannaSessions: DiscoveredSession[] = kannaChats
    .filter((chat) => chat.sessionToken !== null)
    .map((chat) => ({
      sessionId: chat.sessionToken!,
      provider: chat.provider ?? ("claude" as AgentProvider),
      source: "kanna" as const,
      title: resolveTitle(chat.title, "kanna", null, chat.lastMessageAt ?? chat.updatedAt),
      lastExchange: null, // Kanna chats have full transcript, no need for preview
      modifiedAt: chat.lastMessageAt ?? chat.updatedAt,
      kannaChatId: chat.id,
    }))

  // 3. Merge + dedup (Kanna wins)
  const allCliSessions = [...claudeCliSessions, ...codexCliSessions]
  const sessions = mergeSessions(allCliSessions, kannaSessions)

  return { projectId, projectPath, sessions }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/session-discovery.ts src/server/session-discovery.test.ts
git commit -m "feat(session-discovery): discoverSessions orchestrator with merge/dedup"
```

---

## Task 7: Read Models — deriveSessionsSnapshot

**Files:**
- Modify: `src/server/read-models.ts` (add `deriveSessionsSnapshot`)

- [ ] **Step 1: Add deriveSessionsSnapshot function**

In `src/server/read-models.ts`, add at the end of the file:

```typescript
import type { SessionsSnapshot } from "../shared/types"

export function deriveSessionsSnapshot(
  cachedSnapshot: SessionsSnapshot | null
): SessionsSnapshot | null {
  return cachedSnapshot
}
```

This is a passthrough — the actual computation happens in `discoverSessions()`. The read-model just returns the cached snapshot, matching the pattern where `computeSnapshot` in nats-publisher delegates to the appropriate derive function.

- [ ] **Step 2: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No new errors from read-models.ts

- [ ] **Step 3: Commit**

```bash
git add src/server/read-models.ts
git commit -m "feat(read-models): add deriveSessionsSnapshot passthrough"
```

---

## Task 8: NATS Publisher — Sessions Topic + Poll Timer

**Files:**
- Modify: `src/server/nats-publisher.ts` (add sessions to computeSnapshot, add poll timer)

- [ ] **Step 1: Add sessions cache and poll timer state**

In `src/server/nats-publisher.ts`, add state variables near the top where other state is declared:

```typescript
const sessionsCache = new Map<string, SessionsSnapshot>()
const sessionsPollTimers = new Map<string, ReturnType<typeof setInterval>>()
```

- [ ] **Step 2: Add sessions case to computeSnapshot**

In the `computeSnapshot` switch statement (around line 75-99), add before the exhaustive check:

```typescript
case "sessions": {
  const cached = sessionsCache.get(topic.projectId) ?? null
  return deriveSessionsSnapshot(cached)
}
```

Import `deriveSessionsSnapshot` from `./read-models`.

- [ ] **Step 3: Add refreshSessions helper**

Add a helper function that scans, caches, and publishes:

```typescript
import { discoverSessions } from "./session-discovery"
import { resolveEncodedClaudePath } from "./discovery"
import { homedir } from "node:os"
import { join } from "node:path"

async function refreshSessions(projectId: string, projectPath: string): Promise<void> {
  const home = homedir()
  const claudeProjectDir = resolveEncodedClaudePath(projectPath)
  const codexSessionsDir = join(home, ".codex", "sessions")

  const snapshot = await discoverSessions({
    projectId,
    projectPath,
    store,
    claudeProjectDir: claudeProjectDir !== "/" ? claudeProjectDir : null,
    codexSessionsDir,
  })

  sessionsCache.set(projectId, snapshot)
  const topic: SubscriptionTopic = { type: "sessions", projectId }
  publishSnapshot(topic, snapshot)
}
```

- [ ] **Step 4: Add poll timer lifecycle to addSubscription/removeSubscription**

Modify `addSubscription`:

```typescript
function addSubscription(subscriptionId: string, topic: SubscriptionTopic): void {
  activeSubscriptions.set(subscriptionId, topic)

  if (topic.type === "sessions") {
    const projectId = topic.projectId
    // Find projectPath from store state
    const project = store.state.projectsById[projectId]
    if (project && !sessionsPollTimers.has(projectId)) {
      // Initial scan
      refreshSessions(projectId, project.localPath).catch((err) =>
        console.warn(LOG_PREFIX, "sessions scan failed:", error instanceof Error ? err.message : String(err))
      )
      // Start 60s poll timer
      sessionsPollTimers.set(
        projectId,
        setInterval(() => {
          refreshSessions(projectId, project.localPath).catch((err) =>
            console.warn(LOG_PREFIX, "sessions poll failed:", error instanceof Error ? err.message : String(err))
          )
        }, 60_000)
      )
    }
  }
}
```

Modify `removeSubscription` — after the existing dedup cache cleanup, add:

```typescript
// Clean up sessions poll timer if no more subscribers for this projectId
if (removedTopic?.type === "sessions") {
  const projectId = removedTopic.projectId
  const hasOtherSubscribers = [...activeSubscriptions.values()].some(
    (t) => t.type === "sessions" && t.projectId === projectId
  )
  if (!hasOtherSubscribers) {
    const timer = sessionsPollTimers.get(projectId)
    if (timer) {
      clearInterval(timer)
      sessionsPollTimers.delete(projectId)
    }
    sessionsCache.delete(projectId)
  }
}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors (exhaustive switch now handles all cases)

- [ ] **Step 6: Commit**

```bash
git add src/server/nats-publisher.ts src/server/read-models.ts
git commit -m "feat(nats-publisher): sessions topic with poll timer and cache lifecycle"
```

---

## Task 9: NATS Responders — sessions.resume + sessions.refresh

**Files:**
- Modify: `src/server/nats-responders.ts` (add command handlers)

- [ ] **Step 1: Add sessions.refresh handler**

In the command switch in `nats-responders.ts`, add:

```typescript
case "sessions.refresh": {
  // Trigger re-scan for the project
  publisher.refreshSessions(command.projectId)
  return { ok: true }
}
```

Note: You'll need to expose `refreshSessions` from the publisher or pass it as a dependency. The exact wiring depends on how the publisher is injected. Check the existing pattern — if `publisher` object is passed to `registerCommandResponders`, add `refreshSessions` to its interface.

- [ ] **Step 2: Add sessions.refresh to non-mutating commands list**

In the non-mutating commands check (around line 38-50), add `"sessions.refresh"` to the list since it doesn't modify EventStore state.

- [ ] **Step 3: Add sessions.resume handler**

In the command switch, add:

```typescript
case "sessions.resume": {
  const chat = store.createChat(command.projectId)
  store.setSessionToken(chat.id, command.sessionId)
  store.setChatProvider(chat.id, command.provider)
  return { ok: true, chatId: chat.id }
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors (exhaustive switch now handles all command types)

- [ ] **Step 5: Commit**

```bash
git add src/server/nats-responders.ts
git commit -m "feat(nats-responders): handle sessions.resume and sessions.refresh commands"
```

---

## Task 10: Transcript Import

**Files:**
- Modify: `src/server/session-discovery.ts` (add `importCliTranscript`)
- Modify: `src/server/session-discovery.test.ts` (add import test)
- Modify: `src/server/nats-responders.ts` (call import on resume)

- [ ] **Step 1: Write failing test for transcript import**

Append to `src/server/session-discovery.test.ts`:

```typescript
import { parseCliTranscript } from "./session-discovery"

describe("parseCliTranscript", () => {
  test("extracts user and assistant entries from Claude JSONL", () => {
    const lines = [
      JSON.stringify({ type: "summary", summary: "test" }),
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
      JSON.stringify({ type: "assistant", message: { content: "Hi there" } }),
      JSON.stringify({ type: "result", result: "success" }),
      JSON.stringify({ type: "user", message: { content: "Fix bug" } }),
      JSON.stringify({ type: "assistant", message: { content: "Done" } }),
    ]
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 50)

    expect(entries).toHaveLength(4)
    expect(entries[0].kind).toBe("user_prompt")
    expect(entries[1].kind).toBe("assistant_text")
    expect(entries[2].kind).toBe("user_prompt")
    expect(entries[3].kind).toBe("assistant_text")
  })

  test("respects limit parameter", () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0
        ? JSON.stringify({ type: "user", message: { content: `Q${i}` } })
        : JSON.stringify({ type: "assistant", message: { content: `A${i}` } })
    )
    const content = lines.join("\n") + "\n"

    const entries = parseCliTranscript(content, 10)

    expect(entries).toHaveLength(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/session-discovery.test.ts`
Expected: FAIL — `parseCliTranscript` not exported

- [ ] **Step 3: Implement parseCliTranscript**

Add to `src/server/session-discovery.ts`:

```typescript
import type { TranscriptEntry } from "../shared/types"
import { randomUUID } from "node:crypto"

export function parseCliTranscript(
  fileContent: string,
  limit: number
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  const lines = fileContent.split("\n").filter(Boolean)

  for (const line of lines) {
    if (entries.length >= limit) break

    try {
      const parsed = JSON.parse(line)
      if (parsed.type === "user" && parsed.message?.content) {
        entries.push({
          _id: randomUUID(),
          kind: "user_prompt",
          content: String(parsed.message.content),
          createdAt: parsed.timestamp ?? Date.now(),
        } as TranscriptEntry)
      } else if (parsed.type === "assistant" && parsed.message?.content) {
        entries.push({
          _id: randomUUID(),
          kind: "assistant_text",
          text: String(parsed.message.content),
          createdAt: parsed.timestamp ?? Date.now(),
        } as TranscriptEntry)
      }
    } catch {
      // skip malformed lines
    }
  }

  return entries
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS

- [ ] **Step 5: Add importCliTranscript function**

Add to `src/server/session-discovery.ts`:

```typescript
import { readFile } from "node:fs/promises"

export async function importCliTranscript(
  sessionFilePath: string,
  store: EventStore,
  chatId: string,
  limit = 50
): Promise<number> {
  // Idempotent: skip if chat already has messages
  const existing = store.getMessages(chatId)
  if (existing.length > 0) return 0

  const content = await readFile(sessionFilePath, "utf-8")
  const entries = parseCliTranscript(content, limit)

  for (const entry of entries) {
    store.appendMessage(chatId, entry)
  }

  return entries.length
}
```

- [ ] **Step 6: Wire import into sessions.resume handler**

In `src/server/nats-responders.ts`, update the `sessions.resume` handler:

```typescript
case "sessions.resume": {
  const chat = store.createChat(command.projectId)
  store.setSessionToken(chat.id, command.sessionId)
  store.setChatProvider(chat.id, command.provider)

  // Import CLI transcript in background (don't block response)
  const project = store.state.projectsById[command.projectId]
  if (project) {
    findSessionFile(command.sessionId, command.provider, project.localPath)
      .then((filePath) => {
        if (filePath) {
          return importCliTranscript(filePath, store, chat.id, 50)
        }
      })
      .catch((err) =>
        console.warn(LOG_PREFIX, "transcript import failed:", err instanceof Error ? err.message : String(err))
      )
  }

  return { ok: true, chatId: chat.id }
}
```

- [ ] **Step 7: Add findSessionFile helper**

Add to `src/server/session-discovery.ts`:

```typescript
export async function findSessionFile(
  sessionId: string,
  provider: AgentProvider,
  projectPath: string
): Promise<string | null> {
  const home = homedir()

  if (provider === "claude") {
    const claudeDir = resolveEncodedClaudePath(projectPath)
    if (claudeDir === "/") return null
    const filePath = join(claudeDir, `${sessionId}.jsonl`)
    try {
      await stat(filePath)
      return filePath
    } catch {
      return null
    }
  }

  if (provider === "codex") {
    const sessionsDir = join(home, ".codex", "sessions")
    const files = await collectJsonlFiles(sessionsDir)
    for (const filePath of files) {
      const headLines = await readHead(filePath, 1)
      try {
        const parsed = JSON.parse(headLines[0])
        if (parsed.type === "session_meta" && parsed.payload?.id === sessionId) {
          return filePath
        }
      } catch {
        continue
      }
    }
  }

  return null
}
```

Import `resolveEncodedClaudePath` from `./discovery` and `homedir` from `node:os`.

- [ ] **Step 8: Run full tests**

Run: `bun test src/server/session-discovery.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add src/server/session-discovery.ts src/server/session-discovery.test.ts src/server/nats-responders.ts
git commit -m "feat(session-discovery): CLI transcript import on resume with 50-message eager load"
```

---

## Task 11: SessionPicker Component

**Files:**
- Create: `src/client/components/chat-ui/SessionPicker.tsx`
- Create: `src/client/components/chat-ui/SessionPicker.test.tsx`

- [ ] **Step 1: Write failing test for SessionPicker rendering**

Create `src/client/components/chat-ui/SessionPicker.test.tsx`:

```typescript
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SessionPickerContent } from "./SessionPicker"
import type { DiscoveredSession } from "../../../shared/types"

const mockSessions: DiscoveredSession[] = [
  {
    sessionId: "sess-1",
    provider: "claude",
    source: "kanna",
    title: "Fix auth bug",
    lastExchange: { question: "Fix the auth bug", answer: "Done" },
    modifiedAt: Date.now() - 3600_000,
    kannaChatId: "chat-1",
  },
  {
    sessionId: "sess-2",
    provider: "codex",
    source: "cli",
    title: "",
    lastExchange: { question: "Add unit tests for login", answer: "Here are the tests" },
    modifiedAt: Date.now() - 7200_000,
    kannaChatId: null,
  },
]

describe("SessionPickerContent", () => {
  test("renders session list with titles", () => {
    const html = renderToStaticMarkup(
      <SessionPickerContent
        sessions={mockSessions}
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        hasMore={false}
        isRefreshing={false}
      />
    )

    expect(html).toContain("Fix auth bug")
    expect(html).toContain("Add unit tests for login")
  })

  test("renders empty state when no sessions", () => {
    const html = renderToStaticMarkup(
      <SessionPickerContent
        sessions={[]}
        searchQuery=""
        onSelectSession={() => {}}
        onRefresh={() => {}}
        onSearchChange={() => {}}
        onShowMore={() => {}}
        hasMore={false}
        isRefreshing={false}
      />
    )

    expect(html).toContain("No sessions")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/components/chat-ui/SessionPicker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SessionPicker component**

Create `src/client/components/chat-ui/SessionPicker.tsx`:

```tsx
import { useState, useCallback, useRef, useEffect } from "react"
import { History, Search, RefreshCw, Flower, Terminal } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover"
import { Button } from "../../components/ui/button"
import { cn } from "../../../lib/utils"
import type { DiscoveredSession, AgentProvider } from "../../../shared/types"

interface SessionPickerProps {
  sessions: DiscoveredSession[]
  isLoading: boolean
  hasMore: boolean
  onSelectSession: (session: DiscoveredSession) => void
  onRefresh: () => void
  onShowMore: () => void
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}

interface SessionPickerContentProps {
  sessions: DiscoveredSession[]
  searchQuery: string
  onSelectSession: (session: DiscoveredSession) => void
  onRefresh: () => void
  onSearchChange: (query: string) => void
  onShowMore: () => void
  hasMore: boolean
  isRefreshing: boolean
}

function formatRelativeTime(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SourceIcon({ source }: { source: "kanna" | "cli" }) {
  return source === "kanna" ? (
    <Flower className="size-3.5 text-muted-foreground shrink-0" />
  ) : (
    <Terminal className="size-3.5 text-muted-foreground shrink-0" />
  )
}

function ProviderBadge({ provider }: { provider: AgentProvider }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground leading-none">
      {provider === "claude" ? "Claude" : "Codex"}
    </span>
  )
}

export function SessionPickerContent({
  sessions,
  searchQuery,
  onSelectSession,
  onRefresh,
  onSearchChange,
  onShowMore,
  hasMore,
  isRefreshing,
}: SessionPickerContentProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = searchQuery.trim()
    ? sessions.filter((s) => {
        const q = searchQuery.toLowerCase()
        return (
          s.title.toLowerCase().includes(q) ||
          (s.lastExchange?.question.toLowerCase().includes(q) ?? false)
        )
      })
    : sessions

  return (
    <div className="flex flex-col gap-2">
      {/* Search row */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 pl-7 pr-2 text-xs bg-muted/50 border border-border rounded-lg outline-none focus:border-logo/40 transition-colors"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Session list */}
      <div className="max-h-[300px] overflow-y-auto -mx-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No sessions found
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => onSelectSession(session)}
                className="flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg text-left hover:bg-muted/50 transition-colors group"
              >
                <SourceIcon source={session.source} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {session.title ? (
                      <span className="text-sm truncate">{session.title}</span>
                    ) : session.lastExchange?.question ? (
                      <span className="text-sm truncate text-muted-foreground italic">
                        {session.lastExchange.question}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Untitled</span>
                    )}
                    <ProviderBadge provider={session.provider} />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTime(session.modifiedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Show more */}
      {hasMore && !searchQuery.trim() && (
        <button
          onClick={onShowMore}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
        >
          Show older sessions
        </button>
      )}
    </div>
  )
}

export function SessionPicker({
  sessions,
  isLoading,
  hasMore,
  onSelectSession,
  onRefresh,
  onShowMore,
  onOpenChange,
  disabled,
}: SessionPickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    onRefresh()
    // Reset after a short delay (actual data comes via subscription)
    setTimeout(() => setIsRefreshing(false), 2000)
  }, [onRefresh])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setSearchQuery("")
      onOpenChange?.(open)
    },
    [onOpenChange]
  )

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          className="opacity-0 group-hover/section:opacity-100 transition-opacity"
        >
          <History className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        sideOffset={8}
        align="start"
        className="w-72 p-3"
      >
        <SessionPickerContent
          sessions={sessions}
          searchQuery={searchQuery}
          onSelectSession={onSelectSession}
          onRefresh={handleRefresh}
          onSearchChange={setSearchQuery}
          onShowMore={onShowMore}
          hasMore={hasMore}
          isRefreshing={isRefreshing}
        />
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/components/chat-ui/SessionPicker.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/client/components/chat-ui/SessionPicker.tsx src/client/components/chat-ui/SessionPicker.test.tsx
git commit -m "feat(ui): SessionPicker component with search, list, and popover"
```

---

## Task 12: Wire SessionPicker into Sidebar

**Files:**
- Modify: `src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx` (add History button + SessionPicker)
- Modify: `src/client/app/useKannaState.ts` (add sessions subscription + handlers)

- [ ] **Step 1: Add sessions state to useKannaState**

In `src/client/app/useKannaState.ts`, add state variables near other state declarations (around line 199-216):

```typescript
const [sessionsSnapshots, setSessionsSnapshots] = useState<Map<string, SessionsSnapshot>>(new Map())
const [sessionsWindowDays, setSessionsWindowDays] = useState<Map<string, number>>(new Map())
```

Add the import:
```typescript
import type { SessionsSnapshot } from "../shared/types"
```

- [ ] **Step 2: Add sessions subscription management**

Add a subscription helper that subscribes/unsubscribes based on which picker is open:

```typescript
const activeSessionsSubs = useRef<Map<string, () => void>>(new Map())

const handleOpenSessionPicker = useCallback(
  (projectId: string, open: boolean) => {
    if (open) {
      if (activeSessionsSubs.current.has(projectId)) return
      const unsub = socket.subscribe<SessionsSnapshot>(
        { type: "sessions", projectId },
        (snapshot) => {
          setSessionsSnapshots((prev) => new Map(prev).set(projectId, snapshot))
        }
      )
      activeSessionsSubs.current.set(projectId, unsub)
    } else {
      const unsub = activeSessionsSubs.current.get(projectId)
      unsub?.()
      activeSessionsSubs.current.delete(projectId)
    }
  },
  [socket]
)
```

- [ ] **Step 3: Add sessions command handlers**

```typescript
const handleResumeSession = useCallback(
  async (projectId: string, sessionId: string, provider: AgentProvider) => {
    const result = await socket.sendCommand({
      type: "sessions.resume",
      projectId,
      sessionId,
      provider,
    })
    if (result?.ok && result.chatId) {
      navigate(`/chat/${result.chatId}`)
    }
  },
  [socket, navigate]
)

const handleRefreshSessions = useCallback(
  (projectId: string) => {
    socket.sendCommand({ type: "sessions.refresh", projectId })
  },
  [socket]
)

const handleShowMoreSessions = useCallback(
  (projectId: string) => {
    setSessionsWindowDays((prev) => {
      const current = prev.get(projectId) ?? 7
      return new Map(prev).set(projectId, current + 7)
    })
  },
  []
)
```

- [ ] **Step 4: Expose in KannaState return object**

Add to the return object (around line 830-880):

```typescript
sessionsSnapshots,
sessionsWindowDays,
handleOpenSessionPicker,
handleResumeSession,
handleRefreshSessions,
handleShowMoreSessions,
```

- [ ] **Step 5: Add History button to LocalProjectsSection**

In `src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx`, import `SessionPicker`:

```typescript
import { SessionPicker } from "../SessionPicker"
```

In `SortableProjectGroupProps`, add:

```typescript
sessions?: DiscoveredSession[]
sessionsWindowDays?: number
onOpenSessionPicker?: (localPath: string, open: boolean) => void
onNavigateToChat?: (chatId: string) => void
onResumeSession?: (sessionId: string, provider: AgentProvider) => void
onRefreshSessions?: () => void
onShowMoreSessions?: () => void
```

In the project header layout (around line 123), add the SessionPicker **before** the existing SquarePen button:

```tsx
{onResumeSession && (
  <SessionPicker
    sessions={filteredSessions}
    isLoading={false}
    hasMore={hasMoreSessions}
    onSelectSession={(session) => {
      if (session.kannaChatId) {
        onNavigateToChat?.(session.kannaChatId)
      } else {
        onResumeSession(session.sessionId, session.provider)
      }
    }}
    onRefresh={() => onRefreshSessions?.()}
    onShowMore={() => onShowMoreSessions?.()}
    onOpenChange={(open) => onOpenSessionPicker?.(localPath, open)}
    disabled={!isConnected}
  />
)}
```

Where `filteredSessions` filters by the 7-day window:

```typescript
const windowMs = (sessionsWindowDays ?? 7) * 24 * 60 * 60 * 1000
const cutoff = Date.now() - windowMs
const filteredSessions = (sessions ?? []).filter((s) => s.modifiedAt >= cutoff).slice(0, 25)
const hasMoreSessions = (sessions ?? []).some((s) => s.modifiedAt < cutoff)
```

- [ ] **Step 6: Verify typecheck passes**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 7: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/client/app/useKannaState.ts src/client/components/chat-ui/sidebar/LocalProjectsSection.tsx
git commit -m "feat: wire SessionPicker into sidebar with NATS subscription and 7-day windowing"
```

---

## Task 13: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `bun run dev`

- [ ] **Step 2: Verify History button appears**

Open the Kanna UI. Each project group should show a `History` (clock) icon left of the existing `+` button. The icon should be visible on hover.

- [ ] **Step 3: Verify popover opens with sessions**

Click the History icon. A popover should appear with:
- Search input (auto-focused)
- Refresh button
- List of sessions from the last 7 days
- "Show older sessions" button if more exist

- [ ] **Step 4: Verify session resume**

Click a CLI session. It should:
1. Create a new Kanna chat
2. Navigate to the chat
3. Show imported transcript messages

- [ ] **Step 5: Verify new chat button still works**

Click the `+` button — should still create a new blank chat immediately (unchanged behavior).

---

## Summary

| Task | Files | What it does |
|------|-------|-------------|
| 1 | types.ts | Shared types |
| 2 | protocol.ts, nats-subjects.ts | Protocol additions |
| 3 | session-discovery.ts + test | Claude CLI scanner |
| 4 | session-discovery.ts + test | Codex CLI scanner |
| 5 | session-discovery.ts + test | Title resolution + merge |
| 6 | session-discovery.ts + test | discoverSessions orchestrator |
| 7 | read-models.ts | deriveSessionsSnapshot |
| 8 | nats-publisher.ts | Sessions topic + poll timer |
| 9 | nats-responders.ts | sessions.resume + refresh |
| 10 | session-discovery.ts + test | Transcript import |
| 11 | SessionPicker.tsx + test | UI component |
| 12 | LocalProjectsSection.tsx, useKannaState.ts | Wire everything together |
| 13 | Manual | Smoke test |
