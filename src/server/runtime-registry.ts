import { spawnSync } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { RuntimeEntry, RuntimeHealthStatus, RuntimeRegistryState, RuntimeSnapshot } from "../shared/runtime-types"

const LOG_PREFIX = "[RuntimeRegistry]"
const REGISTRY_FILE = "registry.json"

interface DetectOptions {
  binaryName: string
  packageName: string
  versionParser: (stdout: string) => string
}

interface InstallOptions {
  packageName: string
  version: string
  binaryName: string
}

interface InstallResult {
  success: boolean
  entry?: RuntimeEntry
  error?: string
}

export class RuntimeRegistry {
  private state: RuntimeRegistryState = { entries: [], defaults: {} }
  private healthCache = new Map<string, RuntimeHealthStatus>()

  constructor(private readonly runtimesDir: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.runtimesDir, { recursive: true })
    try {
      const raw = await readFile(join(this.runtimesDir, REGISTRY_FILE), "utf-8")
      this.state = JSON.parse(raw) as RuntimeRegistryState
    } catch (err) {
      console.warn(LOG_PREFIX, "no registry found, starting fresh:", err instanceof Error ? err.message : String(err))
      this.state = { entries: [], defaults: {} }
    }
  }

  async detectSystemRuntime(
    provider: "claude" | "codex",
    options: DetectOptions,
  ): Promise<RuntimeEntry | null> {
    const which = spawnSync("which", [options.binaryName], { encoding: "utf-8", timeout: 5000 })
    if (which.status !== 0) return null

    const binaryPath = which.stdout.trim()
    if (!binaryPath) return null

    let version: string
    try {
      const versionResult = spawnSync(binaryPath, ["--version"], { encoding: "utf-8", timeout: 5000 })
      version = options.versionParser(versionResult.stdout.trim())
    } catch (err) {
      console.warn(LOG_PREFIX, "version detection failed:", err instanceof Error ? err.message : String(err))
      version = "unknown"
    }

    const entry: RuntimeEntry = {
      provider,
      version,
      source: "system",
      binaryPath,
      installedAt: Date.now(),
      packageName: options.packageName,
    }

    this.upsertEntry(entry)
    await this.persist()
    return entry
  }

  resolve(provider: string, version?: string): RuntimeEntry | null {
    const candidates = this.state.entries.filter((e) => e.provider === provider)
    if (version) {
      return candidates.find((e) => e.version === version) ?? null
    }
    const defaultVersion = this.state.defaults[provider]
    if (defaultVersion) {
      const defaultEntry = candidates.find((e) => e.version === defaultVersion)
      if (defaultEntry) return defaultEntry
    }
    const managed = candidates
      .filter((e) => e.source === "managed")
      .sort((a, b) => b.installedAt - a.installedAt)
    if (managed.length > 0) return managed[0]
    const system = candidates
      .filter((e) => e.source === "system")
      .sort((a, b) => b.installedAt - a.installedAt)
    return system[0] ?? null
  }

  async healthCheck(provider: string, version?: string): Promise<RuntimeHealthStatus> {
    const entry = this.resolve(provider, version)
    if (!entry) {
      return {
        provider,
        version: version ?? "unknown",
        binaryPath: "",
        status: "unavailable",
        lastChecked: Date.now(),
        error: "No runtime registered",
        latencyMs: 0,
      }
    }

    const start = performance.now()
    const result = spawnSync(entry.binaryPath, ["--version"], { encoding: "utf-8", timeout: 5000 })
    const latencyMs = Math.round(performance.now() - start)

    const health: RuntimeHealthStatus = {
      provider: entry.provider,
      version: entry.version,
      binaryPath: entry.binaryPath,
      status: result.status === 0 ? "healthy" : "degraded",
      lastChecked: Date.now(),
      error: result.status !== 0 ? (result.stderr || "Binary returned non-zero exit code") : undefined,
      latencyMs,
    }

    this.healthCache.set(`${provider}:${entry.version}`, health)
    return health
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      runtimes: this.state.entries.map((entry) => ({
        ...entry,
        health: this.healthCache.get(`${entry.provider}:${entry.version}`) ?? {
          provider: entry.provider,
          version: entry.version,
          binaryPath: entry.binaryPath,
          status: "unavailable" as const,
          lastChecked: 0,
          latencyMs: 0,
        },
      })),
    }
  }

  async installManaged(
    provider: "claude" | "codex",
    options: InstallOptions,
  ): Promise<InstallResult> {
    const installDir = join(this.runtimesDir, provider, options.version)
    await mkdir(installDir, { recursive: true })

    const install = spawnSync(
      "bun",
      ["install", `${options.packageName}@${options.version}`, "--no-save"],
      { cwd: installDir, encoding: "utf-8", timeout: 120_000 },
    )

    if (install.status !== 0) {
      return {
        success: false,
        error: install.stderr || `Install exited with code ${install.status}`,
      }
    }

    const binaryPath = join(installDir, "node_modules", ".bin", options.binaryName)
    const entry: RuntimeEntry = {
      provider,
      version: options.version,
      source: "managed",
      binaryPath,
      installedAt: Date.now(),
      packageName: options.packageName,
    }

    this.upsertEntry(entry)
    await this.persist()
    console.warn(LOG_PREFIX, `Installed ${provider}@${options.version} at ${binaryPath}`)

    return { success: true, entry }
  }

  async removeManaged(provider: string, version: string): Promise<boolean> {
    const installDir = join(this.runtimesDir, provider, version)
    try {
      const { rm } = await import("node:fs/promises")
      await rm(installDir, { recursive: true, force: true })
    } catch (err) {
      console.warn(LOG_PREFIX, `Failed to remove ${provider}@${version}:`, err instanceof Error ? err.message : String(err))
      return false
    }
    this.state.entries = this.state.entries.filter(
      (e) => !(e.provider === provider && e.version === version && e.source === "managed"),
    )
    if (this.state.defaults[provider] === version) {
      const remaining = this.state.entries.filter((e) => e.provider === provider)
      this.state.defaults[provider] = remaining[0]?.version ?? ""
    }
    await this.persist()
    console.warn(LOG_PREFIX, `Removed ${provider}@${version}`)
    return true
  }

  private upsertEntry(entry: RuntimeEntry): void {
    const idx = this.state.entries.findIndex(
      (e) => e.provider === entry.provider && e.version === entry.version && e.source === entry.source,
    )
    if (idx >= 0) {
      this.state.entries[idx] = entry
    } else {
      this.state.entries.push(entry)
    }
    if (!this.state.defaults[entry.provider]) {
      this.state.defaults[entry.provider] = entry.version
    }
  }

  private async persist(): Promise<void> {
    await writeFile(join(this.runtimesDir, REGISTRY_FILE), JSON.stringify(this.state, null, 2))
  }
}
