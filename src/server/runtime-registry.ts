import { spawnSync } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { DiscoveredModel, RuntimeCapabilities, RuntimeEntry, RuntimeHealthStatus, RuntimeRegistryState, RuntimeSnapshot } from "../shared/runtime-types"
import type { AgentProvider } from "../shared/types"

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

export interface RuntimeRegistryOptions {
  probeClaudeModels?: (binaryPath: string) => Promise<DiscoveredModel[]>
}

export class RuntimeRegistry {
  private state: RuntimeRegistryState = { entries: [], defaults: {} }
  private healthCache = new Map<string, RuntimeHealthStatus>()
  private readonly probeClaudeModels: ((binaryPath: string) => Promise<DiscoveredModel[]>) | null
  private readonly inFlightProbes = new Map<string, Promise<void>>()

  constructor(
    private readonly runtimesDir: string,
    options?: RuntimeRegistryOptions,
  ) {
    this.probeClaudeModels = options?.probeClaudeModels ?? null
  }

  async initialize(): Promise<void> {
    await mkdir(this.runtimesDir, { recursive: true })
    try {
      const raw = await readFile(join(this.runtimesDir, REGISTRY_FILE), "utf-8")
      this.state = JSON.parse(raw) as RuntimeRegistryState
      this.deduplicateSystemEntries()
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

  async probeCapabilities(provider: AgentProvider): Promise<void> {
    if (provider !== "claude" || !this.probeClaudeModels) return

    const entry = this.resolve(provider)
    if (!entry) return

    // Already probed for this version
    if (entry.capabilities?.runtimeVersion === entry.version) return

    // De-dupe concurrent probes
    const key = `${entry.provider}:${entry.version}`
    const existing = this.inFlightProbes.get(key)
    if (existing) { await existing; return }

    const probe = (async () => {
      try {
        const models = await this.probeClaudeModels!(entry.binaryPath)
        entry.capabilities = {
          models,
          probedAt: Date.now(),
          runtimeVersion: entry.version,
        }
      } catch (err) {
        entry.capabilities = {
          models: [],
          probedAt: Date.now(),
          runtimeVersion: entry.version,
          error: err instanceof Error ? err.message : String(err),
        }
      } finally {
        this.inFlightProbes.delete(key)
      }
      await this.persist()
    })()

    this.inFlightProbes.set(key, probe)
    await probe
  }

  getProviderCapabilities(provider: string): RuntimeCapabilities | null {
    return this.resolve(provider)?.capabilities ?? null
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
    // System binaries: one entry per (provider, source) — re-detect replaces the old version
    // Managed binaries: one entry per (provider, version, source) — multiple versions coexist
    const idx = this.state.entries.findIndex((e) =>
      entry.source === "system"
        ? e.provider === entry.provider && e.source === "system"
        : e.provider === entry.provider && e.version === entry.version && e.source === entry.source,
    )

    // Clear capabilities when version or binaryPath changes
    if (idx >= 0) {
      const prev = this.state.entries[idx]
      if (prev.version !== entry.version || prev.binaryPath !== entry.binaryPath) {
        delete entry.capabilities
      }
    }

    const replacedDefault = idx >= 0 && this.state.defaults[entry.provider] === this.state.entries[idx].version
    if (idx >= 0) {
      this.state.entries[idx] = entry
    } else {
      this.state.entries.push(entry)
    }

    if (!this.state.defaults[entry.provider] || (entry.source === "system" && replacedDefault)) {
      this.state.defaults[entry.provider] = entry.version
    }
  }

  /** Remove duplicate system entries left by the old upsert logic — keep the most recent per provider */
  private deduplicateSystemEntries(): void {
    const latest = new Map<string, RuntimeEntry>()
    for (const e of this.state.entries) {
      if (e.source !== "system") continue
      const prev = latest.get(e.provider)
      if (!prev || e.installedAt > prev.installedAt) latest.set(e.provider, e)
    }
    this.state.entries = this.state.entries.filter(
      (e) => e.source !== "system" || e === latest.get(e.provider),
    )
    for (const [provider, entry] of latest) {
      this.state.defaults[provider] = entry.version
    }
  }

  private async persist(): Promise<void> {
    await writeFile(join(this.runtimesDir, REGISTRY_FILE), JSON.stringify(this.state, null, 2))
  }
}
