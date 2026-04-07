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
const INTERNAL_WORKFLOW_PROMPT_PREFIXES = [
  "write the first user message for a new independent forked coding session.",
  "write the first user message for a new session that merges context from",
  "generate a short, descriptive title (under 30 chars) for a conversation that starts with this message.",
] as const

interface LastExchange {
  question: string
  answer: string
}

function joinSnippetParts(parts: Array<string | null>, maxLength: number): string | null {
  const combined = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim()

  if (!combined) return null
  return combined.slice(0, maxLength)
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

function normalizeTimestamp(value: unknown): number | undefined {
  const numberValue = normalizeNumber(value)
  if (numberValue !== undefined) return numberValue
  if (typeof value !== "string") return undefined

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractContentText(value: unknown, maxLength: number): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed.slice(0, maxLength) : null
  }

  if (Array.isArray(value)) {
    return joinSnippetParts(value.map((entry) => extractContentText(entry, maxLength)), maxLength)
  }

  if (!isRecord(value)) return null

  if (typeof value.text === "string") {
    const trimmed = value.text.trim()
    if (trimmed) return trimmed.slice(0, maxLength)
  }

  if ("content" in value) {
    const contentText = extractContentText(value.content, maxLength)
    if (contentText) return contentText
  }

  if ("message" in value) {
    const messageText = extractContentText(value.message, maxLength)
    if (messageText) return messageText
  }

  return null
}

function normalizePromptSignature(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase()
}

function isInternalWorkflowPrompt(value: string | null | undefined): boolean {
  const normalized = normalizePromptSignature(value)
  return INTERNAL_WORKFLOW_PROMPT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function shouldExcludeInternalWorkflowSession(args: {
  titleCandidate: string | null
  lastExchange: LastExchange | null
}): boolean {
  return isInternalWorkflowPrompt(args.titleCandidate) || isInternalWorkflowPrompt(args.lastExchange?.question)
}

function formatUsageBucketLabel(windowMinutes: number, fallback: string): string {
  if (windowMinutes % (60 * 24) === 0) return `${windowMinutes / (60 * 24)}d`
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`
  return fallback
}

function extractClaudeRuntime(tailContent: string): DiscoveredSession["runtime"] | undefined {
  const lines = tailContent.split("\n").filter(Boolean)
  let model: string | undefined
  let tokenUsage: DiscoveredSessionTokenUsage | undefined

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (model && tokenUsage) break

    const parsed = parseJsonLine(lines[index])
    if (!parsed) continue

    if (!model && normalizeString(parsed.type) === "assistant") {
      const message = isRecord(parsed.message) ? parsed.message : null
      model = normalizeString(message?.model)
      continue
    }

    if (!tokenUsage && normalizeString(parsed.kind) === "context_usage") {
      const contextUsage = isRecord(parsed.contextUsage) ? parsed.contextUsage : null
      const percentage = normalizeNumber(contextUsage?.percentage)
      const totalTokens = normalizeNumber(contextUsage?.totalTokens)
      const maxTokens = normalizeNumber(contextUsage?.maxTokens)
      if (totalTokens !== undefined) {
        tokenUsage = {
          totalTokens,
          ...(maxTokens !== undefined ? { contextWindow: maxTokens } : {}),
          ...(percentage !== undefined ? { estimatedContextPercent: percentage } : {}),
        }
      }
    }
  }

  if (!model && !tokenUsage) return undefined
  return {
    ...(model ? { model } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
  }
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
    const lastTokenUsage = isRecord(info?.last_token_usage) ? info.last_token_usage : null
    const lastTokens = normalizeNumber(lastTokenUsage?.total_tokens)
    const estimatedContextPercent = contextWindow !== undefined
      ? Math.min(100, Math.round(((lastTokens ?? totalTokens ?? 0) / contextWindow) * 100))
      : undefined

    if (totalTokens !== undefined) {
      tokenUsage = {
        totalTokens,
        ...(contextWindow !== undefined ? { contextWindow } : {}),
        ...(contextWindow !== undefined && totalTokens <= contextWindow
          ? { contextLeft: Math.max(contextWindow - totalTokens, 0) }
          : {}),
        ...(estimatedContextPercent !== undefined ? { estimatedContextPercent } : {}),
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
      const content = extractContentText(parsed.message?.content, 200)
      if (!content) continue
      if (parsed.type === "user") {
        lastUser = content
      } else if (parsed.type === "assistant") {
        lastAssistant = content
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
      const content = parsed.type === "user"
        ? extractContentText(parsed.message?.content, 80)
        : null
      if (content) {
        return content
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
      const content = extractContentText(parsed.message?.content, 20_000)
      if (parsed.type === "user" && content) {
        const entry: UserPromptEntry = {
          _id: randomUUID(),
          kind: "user_prompt",
          content,
          createdAt: parsed.timestamp ?? Date.now(),
        }
        entries.push(entry)
      } else if (parsed.type === "assistant" && content) {
        const entry: AssistantTextEntry = {
          _id: randomUUID(),
          kind: "assistant_text",
          text: content,
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
    const chunkSize = 4096
    const chunks: Buffer[] = []
    let position = 0
    let newlineCount = 0

    while (newlineCount < lineCount) {
      const buffer = Buffer.alloc(chunkSize)
      const { bytesRead } = await fh.read(buffer, 0, chunkSize, position)
      if (bytesRead === 0) break
      const chunk = buffer.subarray(0, bytesRead)
      chunks.push(chunk)
      position += bytesRead

      for (const byte of chunk) {
        if (byte === 10) newlineCount += 1
      }
    }

    const content = Buffer.concat(chunks).toString("utf-8")
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
    if (shouldExcludeInternalWorkflowSession({ titleCandidate, lastExchange })) continue

    sessions.push({
      sessionId,
      provider: "claude" as AgentProvider,
      source: "cli",
      title: titleCandidate ?? formatDateTitle(modifiedAt),
      lastExchange,
      modifiedAt,
      chatId: null,
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
      if (!isRecord(parsed) || normalizeString(parsed.type) !== "session_meta") continue
      const payload = isRecord(parsed.payload) ? parsed.payload : null
      const sessionId = normalizeString(payload?.id)
      const cwd = normalizeString(payload?.cwd)
      if (!sessionId || !cwd) continue
      meta = {
        id: sessionId,
        cwd,
        timestamp: normalizeTimestamp(payload?.timestamp),
      }
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
    if (shouldExcludeInternalWorkflowSession({ titleCandidate, lastExchange })) continue

    sessions.push({
      sessionId: meta.id,
      provider: "codex" as AgentProvider,
      source: "cli",
      title: titleCandidate ?? formatDateTitle(modifiedAt),
      lastExchange,
      modifiedAt,
      chatId: null,
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
  source: "tinkaria" | "cli",
  lastExchange: LastExchange | null,
  modifiedAt: number
): string {
  if (source === "tinkaria" && rawTitle !== "New Chat" && rawTitle.trim() !== "") {
    return rawTitle
  }

  if (lastExchange?.question) {
    return lastExchange.question.slice(0, 80)
  }

  return formatDateTitle(modifiedAt)
}

export function mergeSessions(
  cliSessions: DiscoveredSession[],
  tinkariaSessions: DiscoveredSession[]
): DiscoveredSession[] {
  const bySessionId = new Map<string, DiscoveredSession>()

  for (const session of cliSessions) {
    bySessionId.set(session.sessionId, session)
  }

  for (const session of tinkariaSessions) {
    const existing = bySessionId.get(session.sessionId)
    bySessionId.set(session.sessionId, {
      ...session,
      ...(existing?.lastExchange && !session.lastExchange ? { lastExchange: existing.lastExchange } : {}),
      ...(existing?.runtime && !session.runtime ? { runtime: existing.runtime } : {}),
    })
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

  // 2. Collect Tinkaria chats with sessionToken
  const tinkariaChats = store.listChatsByProject(projectId)
  const tinkariaSessions: DiscoveredSession[] = tinkariaChats
    .filter((chat) => chat.sessionToken !== null)
    .map((chat) => ({
      sessionId: chat.sessionToken!,
      provider: (chat.provider ?? "claude") as AgentProvider,
      source: "tinkaria" as const,
      title: resolveTitle(chat.title, "tinkaria", null, chat.lastMessageAt ?? chat.updatedAt),
      lastExchange: null,
      modifiedAt: chat.lastMessageAt ?? chat.updatedAt,
      chatId: chat.id,
    }))

  // 3. Merge + dedup (Tinkaria wins over CLI)
  const allCliSessions = [...claudeCliSessions, ...codexCliSessions]
  const sessions = mergeSessions(allCliSessions, tinkariaSessions)

  return { projectId, projectPath, sessions }
}

function encodeClaudeProjectDir(projectPath: string): string {
  return join(homedir(), ".claude", "projects", projectPath.replace(/\//g, "-"))
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
