import { readdir, readFile, stat, open } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import type {
  AgentProvider,
  AssistantTextEntry,
  DiscoveredSession,
  DiscoveredSessionTokenUsage,
  DiscoveredSessionUsageBucket,
  SessionsSnapshot,
  TranscriptEntry,
  UserPromptEntry,
} from "../shared/types"
import type { EventStore } from "./event-store"

const TAIL_BYTES = 32 * 1024
const TITLE_SCAN_LINES = 5

interface LastExchange {
  question: string
  answer: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function formatUsageBucketLabel(windowMinutes: number, fallback: string): string {
  if (windowMinutes % (60 * 24) === 0) return `${windowMinutes / (60 * 24)}d`
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`
  return fallback
}

function extractClaudeRuntime(tailContent: string): DiscoveredSession["runtime"] | undefined {
  const lines = tailContent.split("\n").filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index])
    if (!parsed || normalizeString(parsed.type) !== "assistant") continue

    const message = isRecord(parsed.message) ? parsed.message : null
    const model = normalizeString(message?.model)
    if (model) {
      return { model }
    }
  }

  return undefined
}

function extractCodexRuntime(tailContent: string): DiscoveredSession["runtime"] | undefined {
  const lines = tailContent.split("\n").filter(Boolean)
  let model: string | undefined
  let tokenUsage: DiscoveredSessionTokenUsage | undefined
  let usageBuckets: DiscoveredSessionUsageBucket[] | undefined

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonLine(lines[index])
    if (!parsed) continue

    const type = normalizeString(parsed.type)
    if (!model && type === "turn_context") {
      const payload = isRecord(parsed.payload) ? parsed.payload : null
      model = normalizeString(payload?.model)
      continue
    }

    if ((tokenUsage || usageBuckets) || type !== "event_msg") continue

    const payload = isRecord(parsed.payload) ? parsed.payload : null
    if (normalizeString(payload?.type) !== "token_count") continue

    const info = isRecord(payload?.info) ? payload.info : null
    const totalTokenUsage = isRecord(info?.total_token_usage) ? info.total_token_usage : null
    const totalTokens = normalizeNumber(totalTokenUsage?.total_tokens)
    const contextWindow = normalizeNumber(info?.model_context_window)

    if (totalTokens !== undefined) {
      tokenUsage = {
        totalTokens,
        ...(contextWindow !== undefined ? { contextWindow } : {}),
        ...(contextWindow !== undefined ? { contextLeft: Math.max(contextWindow - totalTokens, 0) } : {}),
      }
    }

    const rateLimits = isRecord(payload?.rate_limits) ? payload.rate_limits : null
    if (rateLimits) {
      const buckets: DiscoveredSessionUsageBucket[] = []
      for (const [key, labelFallback] of [["primary", "5h"], ["secondary", "7d"]] as const) {
        const bucket = isRecord(rateLimits[key]) ? rateLimits[key] : null
        const usedPercent = normalizeNumber(bucket?.used_percent)
        if (usedPercent === undefined) continue
        const windowMinutes = normalizeNumber(bucket?.window_minutes)
        buckets.push({
          label: windowMinutes !== undefined ? formatUsageBucketLabel(windowMinutes, labelFallback) : labelFallback,
          usedPercent,
        })
      }
      if (buckets.length > 0) {
        usageBuckets = buckets
      }
    }
  }

  if (!model && !tokenUsage && !usageBuckets) return undefined

  return {
    ...(model ? { model } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(usageBuckets ? { usageBuckets } : {}),
  }
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
        const entry: UserPromptEntry = {
          _id: randomUUID(),
          kind: "user_prompt",
          content: String(parsed.message.content),
          createdAt: parsed.timestamp ?? Date.now(),
        }
        entries.push(entry)
      } else if (parsed.type === "assistant" && parsed.message?.content) {
        const entry: AssistantTextEntry = {
          _id: randomUUID(),
          kind: "assistant_text",
          text: String(parsed.message.content),
          createdAt: parsed.timestamp ?? Date.now(),
        }
        entries.push(entry)
      }
    } catch {
      // skip malformed lines
    }
  }

  return entries
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

async function inspectSessionRuntimeFile(
  filePath: string,
  provider: AgentProvider
): Promise<DiscoveredSession["runtime"] | null> {
  const tailContent = await readTail(filePath, TAIL_BYTES)
  if (provider === "claude") {
    return extractClaudeRuntime(tailContent) ?? null
  }
  if (provider === "codex") {
    return extractCodexRuntime(tailContent) ?? null
  }
  return null
}

async function readHead(filePath: string, lineCount: number): Promise<string[]> {
  const fh = await open(filePath, "r")
  try {
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
    const runtime = extractClaudeRuntime(tailContent)

    sessions.push({
      sessionId,
      provider: "claude" as AgentProvider,
      source: "cli",
      title: titleCandidate ?? formatDateTitle(modifiedAt),
      lastExchange,
      modifiedAt,
      kannaChatId: null,
      ...(runtime ? { runtime } : {}),
    })
  }

  return sessions
}

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
    const runtime = extractCodexRuntime(tailContent)

    const titleLines = await readHead(filePath, TITLE_SCAN_LINES + 1)
    const titleCandidate = extractTitleCandidate(titleLines.slice(1))

    sessions.push({
      sessionId: meta.id,
      provider: "codex" as AgentProvider,
      source: "cli",
      title: titleCandidate ?? formatDateTitle(modifiedAt),
      lastExchange,
      modifiedAt,
      kannaChatId: null,
      ...(runtime ? { runtime } : {}),
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

export function resolveTitle(
  rawTitle: string,
  source: "kanna" | "cli",
  lastExchange: LastExchange | null,
  modifiedAt: number
): string {
  if (source === "kanna" && rawTitle !== "New Chat" && rawTitle.trim() !== "") {
    return rawTitle
  }

  if (lastExchange?.question) {
    return lastExchange.question.slice(0, 80)
  }

  return formatDateTitle(modifiedAt)
}

export function mergeSessions(
  cliSessions: DiscoveredSession[],
  kannaSessions: DiscoveredSession[]
): DiscoveredSession[] {
  const bySessionId = new Map<string, DiscoveredSession>()

  for (const session of cliSessions) {
    bySessionId.set(session.sessionId, session)
  }

  for (const session of kannaSessions) {
    bySessionId.set(session.sessionId, session)
  }

  return [...bySessionId.values()].sort((a, b) => b.modifiedAt - a.modifiedAt)
}

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
      provider: (chat.provider ?? "claude") as AgentProvider,
      source: "kanna" as const,
      title: resolveTitle(chat.title, "kanna", null, chat.lastMessageAt ?? chat.updatedAt),
      lastExchange: null,
      modifiedAt: chat.lastMessageAt ?? chat.updatedAt,
      kannaChatId: chat.id,
    }))

  // 3. Merge + dedup (Kanna wins over CLI)
  const allCliSessions = [...claudeCliSessions, ...codexCliSessions]
  const sessions = mergeSessions(allCliSessions, kannaSessions)

  return { projectId, projectPath, sessions }
}

function encodeClaudeProjectDir(projectPath: string): string {
  return join(homedir(), ".claude", "projects", `-${projectPath.replace(/\//g, "-")}`)
}

export async function findSessionFile(
  sessionId: string,
  provider: AgentProvider,
  projectPath: string
): Promise<string | null> {
  if (provider === "claude") {
    const claudeDir = encodeClaudeProjectDir(projectPath)
    const filePath = join(claudeDir, `${sessionId}.jsonl`)
    try {
      await stat(filePath)
      return filePath
    } catch {
      return null
    }
  }

  if (provider === "codex") {
    const sessionsDir = join(homedir(), ".codex", "sessions")
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

export async function inspectSessionRuntime(
  sessionId: string,
  provider: AgentProvider,
  projectPath: string
): Promise<DiscoveredSession["runtime"] | null> {
  const filePath = await findSessionFile(sessionId, provider, projectPath)
  if (!filePath) return null
  return inspectSessionRuntimeFile(filePath, provider)
}

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
    await store.appendMessage(chatId, entry)
  }

  return entries.length
}
