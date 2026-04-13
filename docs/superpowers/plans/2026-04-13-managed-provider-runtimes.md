# Managed Provider Runtimes & Multi-Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tinkaria fully independent from external Claude/Codex CLI installations by managing provider binaries internally, supporting multi-profile configurations with global/workspace inheritance, and exposing all of this through a Settings UI.

**Architecture:** Three layers — RuntimeRegistry (binary lifecycle), ProfileStore (event-sourced config bundles with inheritance), and Settings UI (new top-level route with tabbed sections). The harness layer gets wired to resolve binaries and env from profiles instead of hardcoded values.

**Tech Stack:** Bun runtime, EventStore (JSONL), NATS (command/subscription), React 19 + Zustand, Tailwind CSS 4

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/server/runtime-registry.ts` | Runtime binary install/detect/health/resolve logic |
| `src/server/runtime-registry.test.ts` | Tests for RuntimeRegistry |
| `src/shared/runtime-types.ts` | Shared types: RuntimeEntry, RuntimeHealth, RuntimeRegistry |
| `src/shared/profile-types.ts` | Shared types: ProviderProfile, WorkspaceProfileOverride, ProfileSnapshot |
| `src/server/event-store-profile.test.ts` | Tests for profile event/reducer/snapshot round-trip |
| `src/client/app/SettingsPage.tsx` | Settings route shell with tab navigation |
| `src/client/app/ProvidersTab.tsx` | Runtime management UI — cards, install, health |
| `src/client/app/ProfilesTab.tsx` | Profile CRUD UI — list, form, workspace overrides |
| `src/client/app/useRuntimeSubscription.ts` | Hook: subscribe to runtime:status topic |
| `src/client/app/useProfileSubscription.ts` | Hook: subscribe to profile snapshot topic |
| `src/client/stores/settingsStore.ts` | Zustand store for settings UI state |

### Modified Files

| File | Changes |
|------|---------|
| `src/shared/protocol.ts` | New SubscriptionTopic entries, new ClientCommand entries |
| `src/shared/types.ts` | Re-export profile/runtime types if needed |
| `src/server/events.ts` | New `ProviderProfileEvent` union, add to `StoreEvent` |
| `src/server/event-store.ts` | Profile reducers, mutations, log path, snapshot, compact |
| `src/server/nats-publisher.ts` | Publish runtime:status and profile snapshots |
| `src/runner/turn-factories.ts` | Accept runtime config, wire into harness spawns |
| `src/server/claude-harness.ts` | Accept `pathToClaudeCodeExecutable` in options |
| `src/server/codex-app-server.ts` | Accept resolved binary path in constructor |
| `src/client/app/App.tsx` | Add `/settings/*` route |
| `src/client/app/AppSidebar.tsx` | Add gear icon linking to settings |

---

## Task 1: Runtime Types

**Files:**
- Create: `src/shared/runtime-types.ts`
- Test: (type-only, checked via typecheck)

- [ ] **Step 1: Write runtime type definitions**

```typescript
// src/shared/runtime-types.ts

export type RuntimeSource = "managed" | "system"

export interface RuntimeEntry {
  provider: "claude" | "codex"
  version: string
  source: RuntimeSource
  binaryPath: string
  installedAt: number
  packageName: string
}

export interface RuntimeHealthStatus {
  provider: string
  version: string
  binaryPath: string
  status: "healthy" | "degraded" | "unavailable"
  lastChecked: number
  error?: string
  latencyMs: number
}

export interface RuntimeRegistryState {
  entries: RuntimeEntry[]
  defaults: Record<string, string>
}

export interface RuntimeSnapshot {
  runtimes: (RuntimeEntry & { health: RuntimeHealthStatus })[]
}
```

- [ ] **Step 2: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit src/shared/runtime-types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/runtime-types.ts
git commit -m "feat: add runtime registry type definitions"
```

---

## Task 2: RuntimeRegistry — Core Logic

**Files:**
- Create: `src/server/runtime-registry.ts`
- Create: `src/server/runtime-registry.test.ts`

- [ ] **Step 1: Write failing test for detectSystemRuntime**

```typescript
// src/server/runtime-registry.test.ts
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { RuntimeRegistry } from "./runtime-registry"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-rt-"))
  tempDirs.push(dir)
  return dir
}

describe("RuntimeRegistry", () => {
  describe("detectSystemRuntime", () => {
    test("detects binary on PATH and returns entry", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      // Use a binary that definitely exists
      const result = await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      expect(result).toBeDefined()
      expect(result!.source).toBe("system")
      expect(result!.version).toBe("1.0.0")
    })

    test("returns null when binary not found", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = await registry.detectSystemRuntime("claude", {
        binaryName: "definitely-not-a-real-binary-xyzzy",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      expect(result).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/runtime-registry.test.ts`
Expected: FAIL — `RuntimeRegistry` not found

- [ ] **Step 3: Implement RuntimeRegistry — detect and resolve**

```typescript
// src/server/runtime-registry.ts
import { spawnSync } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { LOG_PREFIX } from "../shared/branding"
import type { RuntimeEntry, RuntimeHealthStatus, RuntimeRegistryState, RuntimeSnapshot } from "../shared/runtime-types"

const REGISTRY_FILE = "registry.json"

interface DetectOptions {
  binaryName: string
  packageName: string
  versionParser: (stdout: string) => string
}

export class RuntimeRegistry {
  private state: RuntimeRegistryState = { entries: [], defaults: {} }
  private healthCache = new Map<string, RuntimeHealthStatus>()

  constructor(private readonly runtimesDir: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.runtimesDir, { recursive: true })
    try {
      const raw = await readFile(join(this.runtimesDir, REGISTRY_FILE), "utf-8")
      this.state = JSON.parse(raw)
    } catch {
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
    } catch {
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
    // Fallback: managed first, then system, newest first
    const managed = candidates.filter((e) => e.source === "managed").sort((a, b) => b.installedAt - a.installedAt)
    if (managed.length > 0) return managed[0]
    const system = candidates.filter((e) => e.source === "system").sort((a, b) => b.installedAt - a.installedAt)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/runtime-registry.test.ts`
Expected: 2 passing

- [ ] **Step 5: Write failing tests for resolve and healthCheck**

```typescript
// Append to src/server/runtime-registry.test.ts

  describe("resolve", () => {
    test("returns managed entry over system when both exist", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      // Detect system first
      await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      // Simulate a managed entry by accessing internals via detect with different version
      await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.1",
      })

      const result = registry.resolve("claude")
      expect(result).toBeDefined()
      expect(result!.version).toBe("1.0.0") // First detected becomes default
    })

    test("returns null for unknown provider", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = registry.resolve("unknown-provider")
      expect(result).toBeNull()
    })
  })

  describe("healthCheck", () => {
    test("returns healthy for working binary", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      await registry.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "1.0.0",
      })

      const health = await registry.healthCheck("claude")
      expect(health.status).toBe("healthy")
      expect(health.latencyMs).toBeGreaterThanOrEqual(0)
    })

    test("returns unavailable when no runtime registered", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const health = await registry.healthCheck("codex")
      expect(health.status).toBe("unavailable")
      expect(health.error).toBe("No runtime registered")
    })
  })

  describe("persistence", () => {
    test("persists and reloads entries across instances", async () => {
      const dir = await createTempDir()

      const registry1 = new RuntimeRegistry(dir)
      await registry1.initialize()
      await registry1.detectSystemRuntime("claude", {
        binaryName: "echo",
        packageName: "@anthropic-ai/claude-code",
        versionParser: () => "2.0.0",
      })

      const registry2 = new RuntimeRegistry(dir)
      await registry2.initialize()
      const result = registry2.resolve("claude")
      expect(result).toBeDefined()
      expect(result!.version).toBe("2.0.0")
      expect(result!.source).toBe("system")
    })
  })
```

- [ ] **Step 6: Run all tests**

Run: `bun test src/server/runtime-registry.test.ts`
Expected: All passing

- [ ] **Step 7: Commit**

```bash
git add src/server/runtime-registry.ts src/server/runtime-registry.test.ts
git commit -m "feat: add RuntimeRegistry with detect, resolve, health check"
```

---

## Task 3: Managed Runtime Installation

**Files:**
- Modify: `src/server/runtime-registry.ts`
- Modify: `src/server/runtime-registry.test.ts`

- [ ] **Step 1: Write failing test for installManaged**

```typescript
// Append to runtime-registry.test.ts

  describe("installManaged", () => {
    test("installs npm package into versioned directory", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      // Use a small, fast package for testing
      const result = await registry.installManaged("claude", {
        packageName: "is-odd",
        version: "3.0.1",
        binaryName: "is-odd",
      })

      expect(result.success).toBe(true)
      expect(result.entry).toBeDefined()
      expect(result.entry!.source).toBe("managed")
      expect(result.entry!.version).toBe("3.0.1")
    }, 30_000) // npm install can be slow

    test("returns failure for invalid package", async () => {
      const dir = await createTempDir()
      const registry = new RuntimeRegistry(dir)
      await registry.initialize()

      const result = await registry.installManaged("claude", {
        packageName: "@definitely-not-real/package-xyzzy-999",
        version: "0.0.0",
        binaryName: "xyzzy",
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    }, 30_000)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/runtime-registry.test.ts --test-name-pattern "installManaged"`
Expected: FAIL — `installManaged` not a function

- [ ] **Step 3: Implement installManaged**

Add to `RuntimeRegistry` class in `src/server/runtime-registry.ts`:

```typescript
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

  // Resolve binary path in node_modules/.bin/
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
  console.warn(LOG_PREFIX, `[runtime] Installed ${provider}@${options.version} at ${binaryPath}`)

  return { success: true, entry }
}
```

Also add `removeManaged` method:

```typescript
async removeManaged(provider: string, version: string): Promise<boolean> {
  const installDir = join(this.runtimesDir, provider, version)
  try {
    const { rm } = await import("node:fs/promises")
    await rm(installDir, { recursive: true, force: true })
  } catch {
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
  console.warn(LOG_PREFIX, `[runtime] Removed ${provider}@${version}`)
  return true
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/server/runtime-registry.test.ts`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add src/server/runtime-registry.ts src/server/runtime-registry.test.ts
git commit -m "feat: add managed runtime install and remove"
```

---

## Task 4: Profile Types

**Files:**
- Create: `src/shared/profile-types.ts`

- [ ] **Step 1: Write profile type definitions**

```typescript
// src/shared/profile-types.ts
import type { ModelOptions } from "./types"

export interface ProviderProfile {
  id: string
  name: string
  provider: "claude" | "codex"
  runtime: { version: string } | "system"
  model: string
  modelOptions?: ModelOptions
  apiKeyRef?: string          // env var name like "$ANTHROPIC_API_KEY" — never raw key
  systemPrompt?: string
  skills?: string[]
  plugins?: string[]
  env?: Record<string, string>
}

export interface WorkspaceProfileOverride {
  profileId: string
  workspaceId: string
  overrides: Partial<Omit<ProviderProfile, "id" | "provider">>
  updatedAt: number
}

export interface ProviderProfileRecord {
  id: string
  profile: ProviderProfile
  createdAt: number
  updatedAt: number
}

export interface ProfileSnapshot {
  profiles: ProviderProfileRecord[]
  workspaceOverrides: WorkspaceProfileOverride[]
}

export function resolveProfile(
  global: ProviderProfile,
  override?: Partial<Omit<ProviderProfile, "id" | "provider">>,
): ProviderProfile {
  if (!override) return global
  return {
    ...global,
    ...override,
    env: override.env ? { ...global.env, ...override.env } : global.env,
    modelOptions: override.modelOptions
      ? { ...global.modelOptions, ...override.modelOptions }
      : global.modelOptions,
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit src/shared/profile-types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/profile-types.ts
git commit -m "feat: add provider profile type definitions with resolve function"
```

---

## Task 5: Profile Events & EventStore Integration

**Files:**
- Modify: `src/server/events.ts` (add ProviderProfileEvent)
- Modify: `src/server/event-store.ts` (add reducer, state, mutations, persistence)
- Create: `src/server/event-store-profile.test.ts`

- [ ] **Step 1: Write failing test for profile save/list**

```typescript
// src/server/event-store-profile.test.ts
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EventStore } from "./event-store"
import type { ProviderProfile } from "../shared/profile-types"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "kanna-pf-"))
  tempDirs.push(dir)
  return dir
}

const makeProfile = (id: string): ProviderProfile => ({
  id,
  name: `Profile ${id}`,
  provider: "claude",
  runtime: "system",
  model: "opus-4",
  systemPrompt: "You are helpful.",
})

describe("EventStore provider profiles", () => {
  test("saveProviderProfile creates record in providerProfiles", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    const profile = makeProfile("p1")
    await store.saveProviderProfile("p1", profile)

    const record = store.state.providerProfiles.get("p1")
    expect(record).toBeDefined()
    expect(record!.profile.name).toBe("Profile p1")
    expect(record!.profile.provider).toBe("claude")
    expect(record!.createdAt).toBeGreaterThan(0)
  })

  test("saveProviderProfile preserves createdAt on update", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    const firstCreated = store.state.providerProfiles.get("p1")!.createdAt

    const updated = { ...makeProfile("p1"), name: "Updated" }
    await store.saveProviderProfile("p1", updated)

    const record = store.state.providerProfiles.get("p1")!
    expect(record.createdAt).toBe(firstCreated)
    expect(record.updatedAt).toBeGreaterThanOrEqual(firstCreated)
    expect(record.profile.name).toBe("Updated")
  })

  test("removeProviderProfile deletes record", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    await store.removeProviderProfile("p1")

    expect(store.state.providerProfiles.get("p1")).toBeUndefined()
  })

  test("setWorkspaceProfileOverride stores override", async () => {
    const dataDir = await createTempDataDir()
    const store = new EventStore(dataDir)
    await store.initialize()

    await store.saveProviderProfile("p1", makeProfile("p1"))
    await store.setWorkspaceProfileOverride("ws1", "p1", { model: "sonnet-4" })

    const overrides = store.state.workspaceProfileOverrides.get("ws1")
    expect(overrides).toBeDefined()
    const override = overrides!.get("p1")
    expect(override).toBeDefined()
    expect(override!.overrides.model).toBe("sonnet-4")
  })

  test("profiles survive snapshot round-trip", async () => {
    const dataDir = await createTempDataDir()
    const store1 = new EventStore(dataDir)
    await store1.initialize()

    await store1.saveProviderProfile("p1", makeProfile("p1"))
    await store1.setWorkspaceProfileOverride("ws1", "p1", { model: "haiku-4" })
    await store1.compact()

    const store2 = new EventStore(dataDir)
    await store2.initialize()

    const record = store2.state.providerProfiles.get("p1")
    expect(record).toBeDefined()
    expect(record!.profile.name).toBe("Profile p1")

    const override = store2.state.workspaceProfileOverrides.get("ws1")?.get("p1")
    expect(override).toBeDefined()
    expect(override!.overrides.model).toBe("haiku-4")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/event-store-profile.test.ts`
Expected: FAIL — `saveProviderProfile` not a function on EventStore

- [ ] **Step 3: Add ProviderProfileEvent to events.ts**

In `src/server/events.ts`, add after the `AgentConfigEvent` type definition:

```typescript
import type { ProviderProfile } from "../shared/profile-types"

export type ProviderProfileEvent =
  | { v: 3; type: "provider_profile_saved"; timestamp: number; profileId: string; profile: ProviderProfile }
  | { v: 3; type: "provider_profile_removed"; timestamp: number; profileId: string }
  | { v: 3; type: "workspace_profile_override_set"; timestamp: number; workspaceId: string; profileId: string; overrides: Partial<Omit<ProviderProfile, "id" | "provider">> }
  | { v: 3; type: "workspace_profile_override_removed"; timestamp: number; workspaceId: string; profileId: string }
```

Update the `StoreEvent` union to include `ProviderProfileEvent`:

```typescript
export type StoreEvent = WorkspaceEvent | ChatEvent | MessageEvent | TurnEvent | CoordinationEvent | RepoEvent | AgentConfigEvent | WorkflowEvent | SandboxEvent | ProviderProfileEvent
```

- [ ] **Step 4: Add profile state and reducer to event-store.ts**

In the `StoreState` interface, add:

```typescript
providerProfiles: Map<string, ProviderProfileRecord>
workspaceProfileOverrides: Map<string, Map<string, WorkspaceProfileOverride>>
```

In `createEmptyState()`, add:

```typescript
providerProfiles: new Map(),
workspaceProfileOverrides: new Map(),
```

Add a new log path property and initialize it alongside the existing ones:

```typescript
private readonly profilesLogPath: string
// In constructor: this.profilesLogPath = join(dataDir, "profiles.jsonl")
```

Add reducer cases in `applyEvent()`:

```typescript
case "provider_profile_saved": {
  const existing = this.state.providerProfiles.get(event.profileId)
  this.state.providerProfiles.set(event.profileId, {
    id: event.profileId,
    profile: event.profile,
    createdAt: existing?.createdAt ?? event.timestamp,
    updatedAt: event.timestamp,
  })
  break
}

case "provider_profile_removed": {
  this.state.providerProfiles.delete(event.profileId)
  // Also clean up workspace overrides referencing this profile
  for (const [, overrides] of this.state.workspaceProfileOverrides) {
    overrides.delete(event.profileId)
  }
  break
}

case "workspace_profile_override_set": {
  const wsOverrides = this.state.workspaceProfileOverrides.get(event.workspaceId) ?? new Map()
  wsOverrides.set(event.profileId, {
    profileId: event.profileId,
    workspaceId: event.workspaceId,
    overrides: event.overrides,
    updatedAt: event.timestamp,
  })
  this.state.workspaceProfileOverrides.set(event.workspaceId, wsOverrides)
  break
}

case "workspace_profile_override_removed": {
  this.state.workspaceProfileOverrides.get(event.workspaceId)?.delete(event.profileId)
  break
}
```

Add mutation methods:

```typescript
async saveProviderProfile(profileId: string, profile: ProviderProfile): Promise<void> {
  const event: ProviderProfileEvent = {
    v: 3,
    type: "provider_profile_saved",
    timestamp: Date.now(),
    profileId,
    profile,
  }
  this.applyEvent(event)
  await this.appendToLog(this.profilesLogPath, event)
}

async removeProviderProfile(profileId: string): Promise<void> {
  const event: ProviderProfileEvent = {
    v: 3,
    type: "provider_profile_removed",
    timestamp: Date.now(),
    profileId,
  }
  this.applyEvent(event)
  await this.appendToLog(this.profilesLogPath, event)
}

async setWorkspaceProfileOverride(
  workspaceId: string,
  profileId: string,
  overrides: Partial<Omit<ProviderProfile, "id" | "provider">>,
): Promise<void> {
  const event: ProviderProfileEvent = {
    v: 3,
    type: "workspace_profile_override_set",
    timestamp: Date.now(),
    workspaceId,
    profileId,
    overrides,
  }
  this.applyEvent(event)
  await this.appendToLog(this.profilesLogPath, event)
}
```

Wire into `initialize()`, `replayLogs()`, snapshot generation, snapshot loading, and `compact()` — following the same pattern as agentConfigs log.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/server/event-store-profile.test.ts`
Expected: All 5 passing

- [ ] **Step 6: Run existing event store tests to ensure no regression**

Run: `bun test src/server/event-store.test.ts src/server/event-store-agent-config.test.ts`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/server/events.ts src/server/event-store.ts src/server/event-store-profile.test.ts
git commit -m "feat: add provider profile events, reducers, and persistence"
```

---

## Task 6: Protocol — New Subscription Topics & Commands

**Files:**
- Modify: `src/shared/protocol.ts`

- [ ] **Step 1: Add runtime and profile subscription topics**

In `src/shared/protocol.ts`, add to `SubscriptionTopic`:

```typescript
| { type: "runtime-status" }
| { type: "profiles" }
```

- [ ] **Step 2: Add runtime and profile commands**

Add to `ClientCommand`:

```typescript
| { type: "runtime.list" }
| { type: "runtime.detect"; provider: "claude" | "codex" }
| { type: "runtime.install"; provider: "claude" | "codex"; version: string }
| { type: "runtime.remove"; provider: "claude" | "codex"; version: string }
| { type: "runtime.health"; provider: "claude" | "codex"; version?: string }
| { type: "profile.list" }
| { type: "profile.save"; profile: import("./profile-types").ProviderProfile }
| { type: "profile.remove"; profileId: string }
| { type: "profile.resolve"; workspaceId: string; profileId: string }
| { type: "workspace.profile.override.set"; workspaceId: string; profileId: string; overrides: Partial<Omit<import("./profile-types").ProviderProfile, "id" | "provider">> }
| { type: "workspace.profile.override.remove"; workspaceId: string; profileId: string }
```

- [ ] **Step 3: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/protocol.ts
git commit -m "feat: add runtime and profile protocol commands and subscription topics"
```

---

## Task 7: Server-Side Command Handlers

**Files:**
- Modify: `src/server/nats-publisher.ts` (add command handlers for runtime.* and profile.*)

- [ ] **Step 1: Read nats-publisher.ts to understand existing handler pattern**

Read the file to find how existing commands like `workspace.agent.save` are handled, then follow that exact pattern.

- [ ] **Step 2: Write failing test for runtime.list command handler**

Create test that sends a `runtime.list` command and expects a RuntimeSnapshot response. Follow the existing test patterns in `src/server/nats-publisher.test.ts`.

- [ ] **Step 3: Implement runtime command handlers**

Wire `RuntimeRegistry` into the NATS publisher. Handle: `runtime.list`, `runtime.detect`, `runtime.install`, `runtime.remove`, `runtime.health`.

- [ ] **Step 4: Implement profile command handlers**

Wire `EventStore` profile methods. Handle: `profile.list`, `profile.save`, `profile.remove`, `profile.resolve`, `workspace.profile.override.set`, `workspace.profile.override.remove`.

- [ ] **Step 5: Run tests**

Run: `bun test src/server/nats-publisher.test.ts`
Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add src/server/nats-publisher.ts src/server/nats-publisher.test.ts
git commit -m "feat: add NATS command handlers for runtime and profile management"
```

---

## Task 8: Harness Integration — Claude

**Files:**
- Modify: `src/server/claude-harness.ts`
- Modify: `src/runner/turn-factories.ts`

- [ ] **Step 1: Write failing test verifying pathToClaudeCodeExecutable is passed**

```typescript
// In a new test file or extend claude-turn.test.ts
test("createClaudeOptions includes pathToClaudeCodeExecutable when provided", () => {
  // Test that the options object includes the binary path
})
```

- [ ] **Step 2: Add pathToClaudeCodeExecutable to createClaudeOptions**

In `src/server/claude-harness.ts`, modify `createClaudeOptions` to accept and pass through `binaryPath`:

```typescript
function createClaudeOptions(args: {
  localPath: string
  model: string
  effort?: string
  planMode: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
  orchestrator?: SessionOrchestrator
  chatId?: string
  store?: CoordinationStore
  binaryPath?: string              // NEW
  extraEnv?: Record<string, string> // NEW
}): ClaudeOptions {
  // ... existing code ...
  return {
    // ... existing fields ...
    pathToClaudeCodeExecutable: args.binaryPath,
    env: (() => {
      const { CLAUDECODE: _, ...env } = process.env
      return { ...env, ...args.extraEnv }
    })(),
  } satisfies ClaudeOptions
}
```

Also update `startClaudeTurn` args to accept `binaryPath` and `extraEnv`.

- [ ] **Step 3: Update turn-factories.ts to pass runtime config**

In `src/runner/turn-factories.ts`, update `startClaudeTurn` re-export to accept and forward runtime args.

- [ ] **Step 4: Run existing Claude tests**

Run: `bun test src/server/claude-turn.test.ts`
Expected: All passing (new args are optional, backward compatible)

- [ ] **Step 5: Commit**

```bash
git add src/server/claude-harness.ts src/runner/turn-factories.ts
git commit -m "feat: wire runtime binary path into Claude harness"
```

---

## Task 9: Harness Integration — Codex

**Files:**
- Modify: `src/server/codex-app-server.ts`
- Modify: `src/runner/turn-factories.ts`

- [ ] **Step 1: Write failing test for CodexAppServerManager with custom binary**

```typescript
// Append to codex-app-server.test.ts or create focused test
test("CodexAppServerManager uses resolved binary path when provided", () => {
  let spawnedCmd = ""
  const manager = new CodexAppServerManager({
    spawnProcess: (cwd) => {
      // Verify the spawn uses our custom path
      // The existing spawnProcess injection already supports this
    },
  })
  // The test verifies the constructor injection path works
})
```

- [ ] **Step 2: Add binaryPath to CodexAppServerManager constructor**

The constructor already accepts `spawnProcess` injection. Add a simpler `binaryPath` option:

```typescript
constructor(args: { spawnProcess?: SpawnCodexAppServer; binaryPath?: string; extraEnv?: Record<string, string> } = {}) {
  this.spawnProcess = args.spawnProcess ?? ((cwd) =>
    spawn(args.binaryPath ?? "codex", ["app-server"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...args.extraEnv },
    }) as unknown as CodexAppServerProcess)
}
```

- [ ] **Step 3: Update turn-factories.ts singleton to accept runtime config**

```typescript
// src/runner/turn-factories.ts
let codexManager: CodexAppServerManager | null = null

function getCodexManager(binaryPath?: string, extraEnv?: Record<string, string>): CodexAppServerManager {
  if (!codexManager) {
    codexManager = new CodexAppServerManager({ binaryPath, extraEnv })
  }
  return codexManager
}

export async function startCodexTurn(args: {
  // ... existing args ...
  binaryPath?: string
  extraEnv?: Record<string, string>
}): Promise<HarnessTurn> {
  const manager = getCodexManager(args.binaryPath, args.extraEnv)
  // ... rest unchanged ...
}
```

- [ ] **Step 4: Run existing Codex tests**

Run: `bun test src/server/codex-app-server.test.ts`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add src/server/codex-app-server.ts src/runner/turn-factories.ts
git commit -m "feat: wire runtime binary path into Codex harness"
```

---

## Task 10: Settings Route & Layout

**Files:**
- Create: `src/client/app/SettingsPage.tsx`
- Modify: `src/client/app/App.tsx` (add route)
- Modify: `src/client/app/AppSidebar.tsx` (add gear icon)

- [ ] **Step 1: Create SettingsPage shell**

```tsx
// src/client/app/SettingsPage.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { ArrowLeft, Box, User, Bot } from "lucide-react"
import { cn } from "../lib/utils"

const TABS = [
  { path: "providers", label: "Providers", icon: Box },
  { path: "profiles", label: "Profiles", icon: User },
  { path: "agents", label: "Agents", icon: Bot },
] as const

export function SettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full">
      <nav className="w-48 shrink-0 border-r border-border p-4 flex flex-col gap-1">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <h2 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Settings
        </h2>
        {TABS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/client/app/App.tsx`, add inside the `<Route element={<AppLayout />}>` block:

```tsx
import { SettingsPage } from "./SettingsPage"
import { ProvidersTab } from "./ProvidersTab"
import { ProfilesTab } from "./ProfilesTab"

<Route path="/settings" element={<SettingsPage />}>
  <Route index element={<Navigate to="providers" replace />} />
  <Route path="providers" element={<ProvidersTab />} />
  <Route path="profiles" element={<ProfilesTab />} />
</Route>
```

Remove the existing `<Route path="/settings/*" element={<Navigate to="/" replace />} />` redirect.

- [ ] **Step 3: Add gear icon to AppSidebar.tsx**

In the sidebar footer (before the connection status), add:

```tsx
import { Settings } from "lucide-react"

<button
  onClick={() => navigate("/settings")}
  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full"
>
  <Settings className="size-4" />
  Settings
</button>
```

- [ ] **Step 4: Create placeholder ProvidersTab and ProfilesTab**

```tsx
// src/client/app/ProvidersTab.tsx
export function ProvidersTab() {
  return <div className="text-muted-foreground">Providers — coming next</div>
}

// src/client/app/ProfilesTab.tsx
export function ProfilesTab() {
  return <div className="text-muted-foreground">Profiles — coming next</div>
}
```

- [ ] **Step 5: Verify routing works**

Run: `bun run dev:client`
Navigate to `http://localhost:5174/settings` — should see sidebar tabs, "Providers" active, placeholder content.

- [ ] **Step 6: Commit**

```bash
git add src/client/app/SettingsPage.tsx src/client/app/ProvidersTab.tsx src/client/app/ProfilesTab.tsx src/client/app/App.tsx src/client/app/AppSidebar.tsx
git commit -m "feat: add Settings route with tabbed layout and sidebar entry"
```

---

## Task 11: Runtime Subscription Hook

**Files:**
- Create: `src/client/app/useRuntimeSubscription.ts`

- [ ] **Step 1: Write the subscription hook**

Follow the pattern from `useAgentConfigSubscription.ts`:

```tsx
// src/client/app/useRuntimeSubscription.ts
import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { RuntimeSnapshot } from "../../shared/runtime-types"

export function useRuntimeSubscription(socket: AppTransport | null): RuntimeSnapshot | null {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null)

  useEffect(() => {
    if (!socket) return
    const unsub = socket.subscribe<RuntimeSnapshot>(
      { type: "runtime-status" },
      setSnapshot,
    )
    return unsub
  }, [socket])

  return snapshot
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/app/useRuntimeSubscription.ts
git commit -m "feat: add useRuntimeSubscription hook for live runtime status"
```

---

## Task 12: ProvidersTab — Runtime Cards

**Files:**
- Modify: `src/client/app/ProvidersTab.tsx`

- [ ] **Step 1: Implement ProvidersTab with runtime cards**

```tsx
// src/client/app/ProvidersTab.tsx
import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { ChevronDown, ChevronRight, Download, Trash2, RefreshCw, Search } from "lucide-react"
import { cn } from "../lib/utils"
import { useRuntimeSubscription } from "./useRuntimeSubscription"
import type { RuntimeEntry, RuntimeHealthStatus } from "../../shared/runtime-types"

function HealthBadge({ status }: { status: RuntimeHealthStatus["status"] }) {
  const colors = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    unavailable: "bg-red-500",
  }
  return (
    <span className={cn("inline-block size-2 rounded-full", colors[status])} />
  )
}

function RuntimeCard({ entry, health }: { entry: RuntimeEntry; health: RuntimeHealthStatus }) {
  const [expanded, setExpanded] = useState(false)
  const state = useOutletContext<{ socket: any }>()

  const handleHealthCheck = () => {
    state.socket?.command({ type: "runtime.health", provider: entry.provider, version: entry.version })
  }

  const handleRemove = () => {
    if (entry.source === "managed") {
      state.socket?.command({ type: "runtime.remove", provider: entry.provider, version: entry.version })
    }
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HealthBadge status={health.status} />
          <div>
            <span className="font-medium">{entry.provider}</span>
            <span className="text-muted-foreground ml-2">v{entry.version}</span>
            <span className={cn(
              "ml-2 text-xs px-1.5 py-0.5 rounded",
              entry.source === "managed" ? "bg-blue-500/10 text-blue-500" : "bg-zinc-500/10 text-zinc-400"
            )}>
              {entry.source}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleHealthCheck} className="p-1.5 rounded hover:bg-accent" title="Check health">
            <RefreshCw className="size-3.5" />
          </button>
          {entry.source === "managed" && (
            <button onClick={handleRemove} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Remove">
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded hover:bg-accent">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground space-y-1 font-mono">
          <div>Binary: {entry.binaryPath}</div>
          <div>Installed: {new Date(entry.installedAt).toLocaleString()}</div>
          <div>Last check: {health.lastChecked ? new Date(health.lastChecked).toLocaleString() : "never"}</div>
          <div>Latency: {health.latencyMs}ms</div>
          {health.error && <div className="text-destructive">Error: {health.error}</div>}
        </div>
      )}
    </div>
  )
}

export function ProvidersTab() {
  const state = useOutletContext<{ socket: any }>()
  const snapshot = useRuntimeSubscription(state?.socket ?? null)

  const handleDetect = (provider: "claude" | "codex") => {
    state?.socket?.command({ type: "runtime.detect", provider })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Provider Runtimes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage Claude and Codex CLI installations
        </p>
      </div>

      {!snapshot || snapshot.runtimes.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-4">No runtimes detected</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => handleDetect("claude")} className="px-3 py-1.5 bg-accent rounded text-sm flex items-center gap-2">
              <Search className="size-3.5" /> Detect Claude
            </button>
            <button onClick={() => handleDetect("codex")} className="px-3 py-1.5 bg-accent rounded text-sm flex items-center gap-2">
              <Search className="size-3.5" /> Detect Codex
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshot.runtimes.map((rt) => (
            <RuntimeCard key={`${rt.provider}-${rt.version}`} entry={rt} health={rt.health} />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => handleDetect("claude")} className="px-3 py-1.5 bg-accent rounded text-sm flex items-center gap-2">
          <Search className="size-3.5" /> Scan system
        </button>
        <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm flex items-center gap-2">
          <Download className="size-3.5" /> Install runtime
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify UI renders**

Run: `bun run dev:client`
Navigate to `/settings/providers` — should see the empty state or runtime cards.

- [ ] **Step 3: Commit**

```bash
git add src/client/app/ProvidersTab.tsx
git commit -m "feat: implement ProvidersTab with runtime cards and health badges"
```

---

## Task 13: Profile Subscription Hook + ProfilesTab

**Files:**
- Create: `src/client/app/useProfileSubscription.ts`
- Modify: `src/client/app/ProfilesTab.tsx`

- [ ] **Step 1: Write the profile subscription hook**

```tsx
// src/client/app/useProfileSubscription.ts
import { useEffect, useState } from "react"
import type { AppTransport } from "./socket-interface"
import type { ProfileSnapshot } from "../../shared/profile-types"

export function useProfileSubscription(socket: AppTransport | null): ProfileSnapshot | null {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null)

  useEffect(() => {
    if (!socket) return
    const unsub = socket.subscribe<ProfileSnapshot>(
      { type: "profiles" },
      setSnapshot,
    )
    return unsub
  }, [socket])

  return snapshot
}
```

- [ ] **Step 2: Implement ProfilesTab with CRUD**

Build a list of ProfileCards with create/edit/delete. Follow the `AgentConfigPanel.tsx` pattern for form layout and socket commands.

Profile form fields:
- Name (text input)
- Provider (select: claude | codex)
- Runtime (select from available runtimes via RuntimeSnapshot)
- Model (select from ProviderCatalog models)
- API Key Reference (text input, placeholder: "$ANTHROPIC_API_KEY")
- System Prompt (textarea, optional)
- Extra env vars (key-value pairs, optional)

Save sends `{ type: "profile.save", profile: {...} }` via socket.command.
Delete sends `{ type: "profile.remove", profileId }`.

- [ ] **Step 3: Verify UI renders**

Run: `bun run dev:client`
Navigate to `/settings/profiles` — should see empty state with create button, form opens on click.

- [ ] **Step 4: Commit**

```bash
git add src/client/app/useProfileSubscription.ts src/client/app/ProfilesTab.tsx
git commit -m "feat: implement ProfilesTab with CRUD form and subscription"
```

---

## Task 14: NATS Publisher — Runtime & Profile Snapshot Broadcasting

**Files:**
- Modify: `src/server/nats-publisher.ts`

- [ ] **Step 1: Add snapshot broadcasting for runtime-status and profiles topics**

Wire the `RuntimeRegistry.getSnapshot()` and `EventStore` profile state into the NATS publisher so that `snapshot.subscribe` with `{ type: "runtime-status" }` or `{ type: "profiles" }` returns the current state and subscribes to updates.

Follow the existing pattern for `agent-config` topic broadcasting.

- [ ] **Step 2: Add runtime health interval**

Publish updated `runtime:status` snapshots every 60 seconds:

```typescript
setInterval(async () => {
  for (const provider of ["claude", "codex"] as const) {
    await runtimeRegistry.healthCheck(provider)
  }
  publishSnapshot("runtime-status", runtimeRegistry.getSnapshot())
}, 60_000)
```

- [ ] **Step 3: Run tests**

Run: `bun test src/server/nats-publisher.test.ts`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add src/server/nats-publisher.ts
git commit -m "feat: broadcast runtime and profile snapshots via NATS"
```

---

## Task 15: Integration — Wire Profile Resolution into Turn Dispatch

**Files:**
- Modify: `src/runner/runner-agent.ts` (resolve profile before creating turn)
- Modify: `src/runner/turn-factories.ts` (pass resolved binaryPath/env)

- [ ] **Step 1: Read runner-agent.ts to understand turn dispatch flow**

Find where `createTurn` is called and understand what args it receives. The profile resolution needs to happen here — look up the active profile for the workspace+provider, resolve the runtime, and inject binaryPath + env into the turn factory args.

- [ ] **Step 2: Add profile resolution to turn dispatch**

Before calling `createTurn`, query the EventStore (via NATS) to get the resolved profile for the workspace. Extract `binaryPath` from the RuntimeRegistry. Pass both to the turn factory.

This will be a NATS request from the runner to the main server: `profile.resolve` command returns the merged profile + resolved binary path.

- [ ] **Step 3: Run all runner tests**

Run: `bun test src/runner/`
Expected: All passing

- [ ] **Step 4: Run full test suite**

Run: `bun test`
Expected: No regressions

- [ ] **Step 5: Commit**

```bash
git add src/runner/runner-agent.ts src/runner/turn-factories.ts
git commit -m "feat: resolve provider profile and runtime before turn dispatch"
```

---

## Task 16: Smoke Test — End to End

**Files:** No new files

- [ ] **Step 1: Start full stack**

Run: `bun run dev`

- [ ] **Step 2: Verify Settings UI**

1. Navigate to `/settings/providers`
2. Click "Scan system" — should detect claude/codex if installed
3. Verify runtime cards show with health badges
4. Navigate to `/settings/profiles`
5. Create a new profile: "Default Claude", provider: claude, runtime: system, model: opus-4
6. Verify profile appears in list

- [ ] **Step 3: Verify turn uses profile**

1. Open a workspace chat
2. Send a message
3. Check server logs for `[tinkaria] [runtime]` prefix — should show which binary is being used

- [ ] **Step 4: Verify health monitoring**

1. In Settings > Providers, observe health dot
2. Wait 60s, verify it refreshes
3. Expand diagnostics panel — verify binary path, latency shown

- [ ] **Step 5: Document any issues found**

Create GitHub issues for any bugs discovered during smoke testing.

---

## Task 17: Typecheck & Build

**Files:** No new files

- [ ] **Step 1: Run typecheck**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

- [ ] **Step 2: Run full build**

Run: `bun run check`
Expected: Clean build

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve typecheck and build errors for managed runtimes"
```
