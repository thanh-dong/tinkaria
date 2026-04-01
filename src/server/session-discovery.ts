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
