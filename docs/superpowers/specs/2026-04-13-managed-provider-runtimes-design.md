# Managed Provider Runtimes & Multi-Profile Settings

**Date**: 2026-04-13  
**Status**: Draft  
**Scope**: Runtime management, provider profiles, settings UI, harness integration

## Problem

Tinkaria currently assumes provider CLIs (`claude`, `codex`) are installed globally on the user's system. This creates:

- **Fragile onboarding**: Users must install CLIs separately before Tinkaria works
- **No version control**: Tinkaria can't ensure compatible CLI versions
- **No multi-config**: Single global install, no way to run different API keys / models / prompts per workspace
- **Poor failure UX**: Spawn failures surface as opaque errors with no recovery path

## Solution

Three interconnected subsystems:

1. **Runtime Registry** — manages provider binary installations
2. **Profile Store** — named config bundles with global/workspace inheritance
3. **Settings UI** — dedicated top-level area to manage both

## Architecture Overview

```
Settings UI (client)
  │
  ├─ ProvidersTab ──→ runtime.* NATS subjects ──→ RuntimeRegistry
  ├─ ProfilesTab ──→ profile.* NATS subjects ──→ ProfileStore (EventStore)
  └─ AgentsTab ───→ (existing AgentConfig events)
  
Chat turn flow:
  Turn request
    → ProfileResolver.resolve(workspaceId, provider)
    → RuntimeRegistry.resolve(provider, version)
    → Harness.spawn(binaryPath, env, model)
```

---

## 1. Runtime Registry

### Purpose

Manage provider binary installations. Global scope — one registry serves all workspaces.

### Storage

```
~/.tinkaria/data/runtimes/
├── registry.json          # installed runtimes index
├── claude/
│   └── 1.0.34/
│       └── node_modules/  # managed npm install
└── codex/
    └── 0.1.20/
        └── node_modules/
```

### Schema

```typescript
interface RuntimeEntry {
  provider: "claude" | "codex"
  version: string
  source: "managed" | "system"
  binaryPath: string        // resolved absolute path
  installedAt: number        // timestamp
  packageName: string        // "@anthropic-ai/claude-code" | "@openai/codex"
}

interface RuntimeRegistry {
  entries: RuntimeEntry[]
  defaults: Record<string, string>  // provider → version
}

interface RuntimeHealthCheck {
  provider: string
  version: string
  binaryPath: string
  status: "healthy" | "degraded" | "unavailable"
  lastChecked: number
  error?: string
  latencyMs: number  // spawn --version time
}
```

### Operations

| Operation | Behavior |
|-----------|----------|
| `installRuntime(provider, version?)` | `bun install` into managed dir, register entry, run health check |
| `detectSystemRuntime(provider)` | `which <binary>`, probe `--version`, register as `source: "system"` |
| `resolveRuntime(provider, version?)` | Returns binary path. Checks managed first, falls back to system |
| `removeRuntime(provider, version)` | Cleanup managed dir, deregister |
| `healthCheck(provider, version?)` | Spawn `--version`, timeout 5s, return status |

### Health Check Protocol

Runs on:
- Server startup (all default runtimes)
- Before first turn per session
- Every 60s via background interval
- On-demand from Settings UI

### Startup Sequence (fail-fast, never blocking)

1. Load `registry.json`
2. For each default runtime: spawn `--version`, timeout 5s
3. Unhealthy → mark degraded, scan for alternatives (other versions, system)
4. No runtime at all → server starts, provider flagged unavailable → UI shows setup card
5. Server startup never blocked by runtime health

### Failure Modes

| Failure | Detection | Recovery | UX |
|---------|-----------|----------|----|
| Binary missing on PATH | `which` returns empty | Prompt managed install | Banner: "No claude found. [Install] [Configure path]" |
| Managed install corrupt | Health check fails (spawn + timeout) | Auto-reinstall, notify | Toast: "Runtime corrupted, reinstalling..." |
| Version incompatible | SDK min-version check | Offer upgrade, block turn if critical | Modal: "v1.0.20 required, have v1.0.15. [Upgrade]" |
| Spawn fails at turn time | Catch spawn error in harness | Retry once, then surface with diagnostic | Error card: "Failed to start claude. [View logs] [Retry] [Change runtime]" |
| npm install fails | Non-zero exit + stderr | Show error, suggest manual | Settings: install status with full error |
| Disk full / permission denied | ENOSPC / EACCES | Don't retry, clear error | "Cannot install: [reason]" |

### Observability

- `runtime:status` WebSocket topic — client subscribes for live health badges
- All operations logged with `[tinkaria] [runtime]` prefix
- Failed spawns capture: command, args, env (keys masked), cwd, exit code, stderr
- Diagnostics panel per runtime in Settings UI

---

## 2. Profile Store

### Purpose

Named config bundles. Global profiles inheritable by workspaces with per-workspace overrides.

### Schema

```typescript
interface ProviderProfile {
  id: string
  name: string                              // "Work Claude Opus"
  provider: "claude" | "codex"
  runtime: { version: string } | "system"   // which binary
  model: string                             // "opus-4", "gpt-5.4"
  modelOptions?: ModelOptions               // reasoning effort, context window, fast mode
  apiKey?: string                           // encrypted at rest
  systemPrompt?: string                     // prepended to every turn
  skills?: string[]                         // skill IDs to load
  plugins?: string[]                        // plugin references
  env?: Record<string, string>              // extra env vars passed to spawn
}

interface WorkspaceProfileOverride {
  profileId: string                         // references global profile
  workspaceId: string
  overrides: Partial<Omit<ProviderProfile, "id" | "provider">>
}
```

### Inheritance

```
Workspace asks for profile
  → Find WorkspaceProfileOverride for (workspaceId, profileId)
  → Merge: global profile fields + override fields (override wins)
  → Resolved config feeds into harness
```

### Persistence

Event-sourced in existing EventStore. New event types:

- `profile_created` — full profile payload
- `profile_updated` — partial update (changed fields only)
- `profile_deleted` — soft delete with orphan check
- `workspace_profile_override_set` — workspace-specific overrides

### API Key Handling

- Never stored in plaintext in events
- Encrypted with machine-scoped key before persisting
- UI shows masked `sk-...****`
- Supports env var reference: `$ANTHROPIC_API_KEY` — resolved at spawn time, never stored
- Format validation: warns on mismatch (`sk-ant-...` for Claude, `sk-...` for Codex) but doesn't block

### Default Behavior

If no profiles exist on first launch:
1. Detect system runtimes
2. Auto-create "Default Claude" and "Default Codex" profiles using system binaries
3. Zero-config migration — existing users see no change

### Failure Modes

| Failure | Detection | UX |
|---------|-----------|-----|
| Referenced runtime removed | Profile resolution finds missing entry | "Runtime no longer installed. [Install] [Switch]" |
| API key invalid | First turn auth error | "API key rejected. [Update key] [Try different profile]" |
| Profile deleted while referenced | Orphan check on delete | "3 workspaces use this. [Reassign] [Force delete]" |
| No profiles exist | Server startup check | Auto-create defaults from system detection |

---

## 3. Settings UI

### Routing

New top-level route `/settings` with tabbed sub-sections:

```
/settings
├── /settings/providers    ← Runtime management
├── /settings/profiles     ← Provider profiles (CRUD)
└── /settings/agents       ← AgentConfig (already exists, surface here)
```

Future tabs slot in: `/settings/keys`, `/settings/appearance`, `/settings/plugins`.

### Entry Point

Gear icon in sidebar footer. Persistent, not project-scoped.

### Layout

```
┌─────────────────────────────────────────────────┐
│  ← Back to chat          Settings               │
├──────────┬──────────────────────────────────────┤
│          │                                       │
│ Providers│  [Provider Card]                      │
│ Profiles │  Runtime, version, health badge       │
│ Agents   │  Binary path, source badge            │
│          │  [Actions] [Diagnostics ▾]            │
│          │                                       │
└──────────┴──────────────────────────────────────┘
```

### Component Breakdown

| Component | Role |
|-----------|------|
| `SettingsLayout` | Shell: back nav + left tab list + right content area |
| `SettingsNav` | Vertical tab list. Extensible — just add route |
| `ProvidersTab` | Lists RuntimeCards + install controls |
| `RuntimeCard` | Provider runtime: version, source badge, health dot, actions, diagnostics |
| `ProfilesTab` | Lists ProfileCards + create button |
| `ProfileCard` | Name, provider, model, runtime reference, edit/delete |
| `ProfileForm` | Create/edit: name → provider → runtime → model → key → prompts |
| `AgentsTab` | Surfaces existing AgentConfig CRUD |

### State Management

New Zustand store `useSettingsStore`:
- Fetches runtimes + profiles from server on mount
- Subscribes to `runtime:status` and `profile:*` WebSocket topics
- Live updates — health badges, install progress, profile changes

### Server Endpoints (NATS responders)

| Subject | Purpose |
|---------|---------|
| `runtime.list` | All registered runtimes with health |
| `runtime.install` | Install managed runtime (provider, version) — streams progress |
| `runtime.remove` | Remove managed runtime |
| `runtime.detect` | Scan system PATH for provider binaries |
| `runtime.health` | Run health check, return status |
| `profile.list` | All global profiles |
| `profile.save` | Create/update profile |
| `profile.delete` | Delete profile (with orphan check) |
| `profile.resolve` | Resolve effective profile for workspace |

### Defensive UI

Every action provides:
- **Live feedback**: progress streams for installs, spinners for health checks
- **Error details**: full error messages, not just "something went wrong"
- **Recovery actions**: every error has at least one actionable button
- **Diagnostics panel**: per-runtime expandable section showing binary path, install date, last health check, recent errors, spawn env (keys masked)
- **"Copy all diagnostics" button**: JSON blob for bug reports

### Form Validation

- Profile name: required, unique, no special chars
- API key: format check (warns but doesn't block)
- Runtime selection: only healthy/degraded runtimes selectable. Unavailable greyed out with reason
- Model: validated against provider catalog. Unknown → warning

---

## 4. Harness Integration

### Current State

- `claude-harness.ts`: imports `@anthropic-ai/claude-agent-sdk`, SDK spawns `claude` binary internally
- `codex-app-server.ts:818`: hardcodes `spawn("codex", ["app-server"])`

### New Turn Flow

```
1. Chat turn arrives with (workspaceId, provider)
2. ProfileResolver.resolve(workspaceId, provider)
   → WorkspaceProfileOverride + GlobalProfile → merged config
3. RuntimeRegistry.resolve(config.provider, config.runtime.version)
   → binaryPath (or error if unavailable)
4. Harness receives (binaryPath, env, model, modelOptions)
5. Harness spawns using resolved path + merged env
```

### Codex Changes

```typescript
// codex-app-server.ts constructor — already supports injection via SpawnCodexAppServer
// Wire RuntimeRegistry into the factory:

constructor(args: { runtimeRegistry: RuntimeRegistry }) {
  this.spawnProcess = (cwd) => {
    const runtime = args.runtimeRegistry.resolve("codex")
    return spawn(runtime.binaryPath, ["app-server"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...runtime.env },
    }) as unknown as CodexAppServerProcess
  }
}
```

### Claude Changes

The SDK respects env/options for binary resolution. `ClaudeSdkBinding` (line 31) wraps the SDK — inject resolved binary path through SDK options or `CLAUDE_CODE_PATH` env var.

### Resolution Fallback Order

1. Requested managed version (from profile)
2. Other managed versions (newest first)
3. System binary
4. Error with actionable UI (install prompt, profile switch)

Configurable per profile via `runtime` field:
- `{ version: "1.0.34" }` → specific managed version
- `"system"` → system binary only, no fallback to managed

### Zero Breaking Change

- Default profiles auto-created from system binaries on first launch
- Existing `spawn("codex", ...)` path works — it's now the default profile pointing at system
- No migration needed — system detection runs automatically

---

## 5. Active Profile in Chat

### Chat Header Integration

Existing mobile info row / chat header gets a profile badge:

```
claude/opus-4 (Work Claude Opus) 🟢
```

- Click → quick-switch dropdown with available profiles
- Profile change takes effect on next turn
- Health dot reflects current runtime status

### WebSocket Live Updates

- `runtime:health` published every 60s — client updates badges
- Health degradation mid-session → non-intrusive banner: "Claude runtime health degraded. [Details]"
- Does not interrupt active conversation

---

## Non-Goals (Explicit)

- **Custom provider plugins** — only Claude and Codex for now. Extension point exists in ProviderCatalog but no plugin API yet
- **Remote runtime management** — all runtimes are local to the Tinkaria server machine
- **Automatic updates** — managed runtimes are installed at specific versions. User initiates upgrades
- **API key rotation** — profiles store one key. Rotation is manual

---

## Success Criteria

1. Fresh Tinkaria install with no global CLIs can install + run both providers from Settings UI
2. Existing users with system CLIs see auto-detected runtimes, zero config change needed
3. User can create "Work" and "Personal" profiles with different API keys, switch per workspace
4. Runtime health visible at a glance — green/yellow/red in Settings and chat header
5. Every failure mode has an actionable recovery path in the UI
6. Full diagnostic export available for debugging
