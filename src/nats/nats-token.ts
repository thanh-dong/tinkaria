import { join } from "node:path"
import { mkdirSync } from "node:fs"

const TOKEN_FILE = "nats.token"

/** Generate a cryptographically random token string. */
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

/**
 * Ensure a NATS auth token exists in `dataDir/nats.token`.
 * If missing, generates one with atomic write (tmp + rename).
 * Called by the NATS daemon only (single owner).
 */
export async function ensureToken(dataDir: string): Promise<string> {
  const tokenPath = join(dataDir, TOKEN_FILE)
  const file = Bun.file(tokenPath)

  if (await file.exists()) {
    const existing = (await file.text()).trim()
    if (existing.length > 0) return existing
  }

  mkdirSync(dataDir, { recursive: true })

  const token = generateToken()
  const tmpPath = `${tokenPath}.tmp.${process.pid}`
  await Bun.write(tmpPath, token + "\n")

  // Atomic rename — prevents partial reads by other processes
  const { renameSync } = await import("node:fs")
  renameSync(tmpPath, tokenPath)

  return token
}

/**
 * Read the NATS auth token from `dataDir/nats.token`.
 * Called by server and runner processes.
 * Throws if the file does not exist (daemon not started yet).
 */
export async function readToken(dataDir: string): Promise<string> {
  const tokenPath = join(dataDir, TOKEN_FILE)
  const file = Bun.file(tokenPath)

  if (!(await file.exists())) {
    throw new Error(`NATS token file not found: ${tokenPath} — is the NATS daemon running?`)
  }

  const content = (await file.text()).trim()
  if (content.length === 0) {
    throw new Error(`NATS token file is empty: ${tokenPath}`)
  }

  return content
}
